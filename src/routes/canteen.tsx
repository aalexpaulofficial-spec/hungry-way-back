import { createFileRoute } from "@tanstack/react-router";
import { BackButton, useBackStep } from "@/lib/back-nav";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LogOut, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { claimCanteen, ownerUpdateOrderStatus } from "@/lib/hungry.functions";
import { ORDER_TYPE_LABELS, PAYMENT_STATUS_LABELS, type OrderType } from "@/lib/order-rules";
import { ORDER_LABELS, type MenuItem } from "@/lib/access";
import { foodImage } from "@/lib/foodexa-images";
import { cn } from "@/lib/utils";
import { backendConfigured } from "@/lib/backend-config";
import { SetupNotice } from "@/components/SetupNotice";

export const Route = createFileRoute("/canteen")({
  ssr: false,
  validateSearch: z.object({ code: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Canteen Dashboard — HUNGRY" },
      { name: "description", content: "Manage your HUNGRY canteen menu and live orders." },
      { property: "og:title", content: "Canteen Dashboard — HUNGRY" },
      { property: "og:description", content: "Manage your canteen menu and orders on HUNGRY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CanteenPage,
});

const field =
  "w-full rounded-2xl border border-input bg-ink-soft px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary";

type Canteen = { id: string; code: string; name: string; university_name: string; visibility: string; is_active: boolean };

function CanteenPage() {
  const { code } = Route.useSearch();
  const claim = useServerFn(claimCanteen);
  const [state, setState] = useState<"loading" | "auth" | "code" | "ok">("loading");
  const [canteen, setCanteen] = useState<Canteen | null>(null);
  const [codeInput, setCodeInput] = useState((code ?? "").toUpperCase().slice(0, 7));
  const [err, setErr] = useState("");

  const resolve = useCallback(async (tryCode?: string) => {
    setErr("");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setState("auth");
    if (tryCode && /^[A-Z0-9]{7}$/.test(tryCode)) {
      try {
        await claim({ data: { code: tryCode } });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Invalid code");
      }
    }
    const q = supabase.from("canteens").select("id, code, name, university_name, visibility, is_active").eq("owner_user_id", data.user.id);
    const { data: rows } = tryCode ? await q.eq("code", tryCode) : await q.limit(1);
    const c = (rows?.[0] as Canteen | undefined) ?? null;
    setCanteen(c);
    setState(c ? "ok" : "code");
  }, [claim]);

  useEffect(() => {
    if (backendConfigured) resolve(codeInput || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setCanteen(null);
    setState("auth");
  }

  if (!backendConfigured) return <SetupNotice title="Canteen dashboard isn't connected yet" />;
  if (state === "loading") return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</div>;
  if (state === "ok" && canteen) return <Dashboard canteen={canteen} onSignOut={signOut} />;

  return (
    <div className="grain relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="ember anim-pulse-glow pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2" />
      <div className="relative mx-auto w-full max-w-md">
        <a href="/" className="mb-8 block text-center display text-[15px] tracking-[0.3em]">HUNGRY</a>
        <div className="glass-red anim-rise rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-bright">Canteen Dashboard</p>
          {state === "auth" ? (
            <OwnerAuth onDone={() => resolve(codeInput || undefined)} />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); resolve(codeInput); }} className="mt-3 space-y-4">
              <h1 className="display text-2xl">Enter your canteen code</h1>
              <p className="text-sm text-muted-foreground">Use the approved 7-character code from your approval email. Unapproved canteens must register first.</p>
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))} placeholder="ABC1234" aria-label="Canteen code" className={cn(field, "py-4 text-center font-mono text-2xl tracking-[0.5em]")} />
              {err && <p className="text-xs text-primary-bright">{err}</p>}
              <button className="w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground">Open dashboard</button>
              <div className="flex justify-between text-xs text-muted-foreground">
                <a href="/register-canteen" className="hover:text-foreground">Register a canteen</a>
                <button type="button" onClick={signOut} className="hover:text-foreground">Use another account</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerAuth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!email || password.length < 8) return setErr("Enter your email and a password of 8+ characters.");
    setErr("");
    setBusy(true);
    const res = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) return setErr(mode === "login" ? "Wrong email or password." : res.error.message);
    if (!res.data.session) {
      const r = await supabase.auth.signInWithPassword({ email, password });
      if (r.error) return setErr("Account created. Please log in.");
    }
    onDone();
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-4">
      <h1 className="display text-2xl">{mode === "login" ? "Owner login" : "Create owner account"}</h1>
      <p className="text-sm text-muted-foreground">Use the same contact email you gave in your canteen application.</p>
      <input name="email" type="email" placeholder="Contact email" autoComplete="email" className={field} />
      <input name="password" type="password" placeholder="Password (8+ characters)" autoComplete={mode === "login" ? "current-password" : "new-password"} className={field} />
      {err && <p className="text-xs text-primary-bright">{err}</p>}
      <button disabled={busy} className="w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Please wait…" : mode === "login" ? "Login" : "Create account"}</button>
      <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
        {mode === "login" ? "First time? Create your owner account" : "Already have an account? Log in"}
      </button>
    </form>
  );
}

type Order = { id: string; order_number: string; customer_name: string; lines: { name: string; qty: number }[]; total: number; discount: number; pickup_code: string; status: string; created_at: string; order_type: string; payment_method: string; payment_status: string };
const uid = () => Math.random().toString(36).slice(2);
const NEXT: Record<string, string | undefined> = { placed: "preparing", preparing: "ready", ready: "collected" };
const IMAGES = ["food-indian", "food-bowl", "food-burger", "food-pizza", "food-coffee", "campus-cafeteria"];

function Dashboard({ canteen, onSignOut }: { canteen: Canteen; onSignOut: () => void }) {
  const [tab, setTab] = useState<"orders" | "menu">("orders");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  useBackStep(tab !== "orders", () => setTab("orders"));
  useBackStep(!!editing, () => setEditing(null));
  const [err, setErr] = useState("");
  const [orderMsg, setOrderMsg] = useState("");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const move = useServerFn(ownerUpdateOrderStatus);

  async function setStatus(o: Order, status: "preparing" | "ready" | "collected" | "cancelled") {
    if (status === "cancelled" && !window.confirm(o.payment_status === "paid" ? `Cancel ${o.order_number}? The customer will be refunded ₹${o.total} automatically.` : `Cancel ${o.order_number}?`)) return;
    setBusyOrder(o.id);
    setOrderMsg("");
    try {
      const r = await move({ data: { orderId: o.id, status } });
      if (r.refund) setOrderMsg(`${o.order_number} cancelled — refund started.`);
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : "Could not update order");
    } finally {
      setBusyOrder(null);
    }
  }

  useEffect(() => {
    const loadMenu = async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("canteen_id", canteen.id).order("category").order("name");
      setMenu((data as MenuItem[]) ?? []);
    };
    const loadOrders = async () => {
      const { data } = await supabase.from("orders").select("*").eq("canteen_id", canteen.id).order("created_at", { ascending: false }).limit(100);
      setOrders((data as unknown as Order[]) ?? []);
    };
    loadMenu();
    loadOrders();
    const ch = supabase
      .channel(`canteen-${canteen.id}-${uid()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `canteen_id=eq.${canteen.id}` }, loadMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `canteen_id=eq.${canteen.id}` }, loadOrders)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [canteen.id]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const row = {
      canteen_id: canteen.id,
      name: String(fd.get("name") ?? "").trim().slice(0, 80),
      description: String(fd.get("description") ?? "").trim().slice(0, 300),
      price: Math.round(Number(fd.get("price"))),
      category: String(fd.get("category") ?? "").trim().slice(0, 30) || "Meals",
      prep_minutes: Math.round(Number(fd.get("prep_minutes")) || 10),
      counter: String(fd.get("counter") ?? "").trim().slice(0, 30) || "Counter 1",
      tag: String(fd.get("tag") ?? "").trim().slice(0, 30) || null,
      stock: String(fd.get("stock") ?? "").trim() === "" ? null : Math.max(0, Math.round(Number(fd.get("stock")))),
      image: String(fd.get("image") ?? "food-indian"),
      veg: fd.get("veg") === "on",
      available: fd.get("available") === "on",
    };
    if (!row.name || !Number.isFinite(row.price) || row.price < 0) return setErr("Enter a name and a valid price.");
    if (row.stock !== null && !Number.isFinite(row.stock)) return setErr("Stock must be a number, or empty for unlimited.");
    const { error } = editing?.id
      ? await supabase.from("menu_items").update(row).eq("id", editing.id)
      : await supabase.from("menu_items").insert(row);
    if (error) return setErr("Could not save item.");
    setEditing(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
          <BackButton inline />
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.3em] text-primary-bright">CANTEEN DASHBOARD · {canteen.code}</p>
            <h1 className="display text-3xl">{canteen.name}</h1>
            <p className="text-sm text-muted-foreground">{canteen.university_name} · <span className="capitalize">{canteen.visibility}</span></p>
          </div>
          </div>
          <button onClick={onSignOut} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" /> Log out</button>
        </header>
        {canteen.visibility === "maintenance" && <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm text-primary-bright">Your canteen is in maintenance mode — customers can't place orders.</p>}
        <div className="mt-6 flex gap-2">
          {([["orders", `Live orders (${orders.filter((o) => o.status !== "collected" && o.status !== "cancelled").length})`], ["menu", `Menu (${menu.length})`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-full border px-4 py-2 text-xs font-semibold", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{l}</button>
          ))}
        </div>

        {orderMsg && tab === "orders" && <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm">{orderMsg}</p>}
        {tab === "orders" ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {!orders.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:col-span-2">No orders yet. New orders appear here instantly.</p>}
            {orders.map((o) => (
              <div key={o.id} className="rounded-3xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{o.order_number}</span>
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-widest">{ORDER_LABELS[o.status]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.customer_name} · pickup {o.pickup_code} · {new Date(o.created_at).toLocaleTimeString()}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-primary-bright">{ORDER_TYPE_LABELS[o.order_type as OrderType] ?? "Dine-in"} · {o.payment_method === "counter" && o.payment_status === "unpaid" ? `Collect ₹${o.total} at counter` : (PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status)}</p>
                <p className="mt-2 text-sm">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
                <p className="mt-1 text-sm font-bold">₹{o.total}</p>
                {NEXT[o.status] && (
                  <div className="mt-3 flex gap-2">
                    <button disabled={busyOrder === o.id} onClick={() => setStatus(o, NEXT[o.status] as "preparing" | "ready" | "collected")} className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{o.status === "ready" && o.payment_method === "counter" ? "Mark paid & collected" : `Mark ${ORDER_LABELS[NEXT[o.status]!]}`}</button>
                    {o.status === "placed" && <button disabled={busyOrder === o.id} onClick={() => setStatus(o, "cancelled")} className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground disabled:opacity-50">Cancel</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <button onClick={() => setEditing({ veg: true, available: true, image: "food-indian" })} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add item</button>
            {editing && (
              <form key={editing.id ?? "new"} onSubmit={save} className="glass-red mt-4 grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
                <input name="name" defaultValue={editing.name} placeholder="Item name" className={field} />
                <input name="price" type="number" min={0} defaultValue={editing.price} placeholder="Price (₹)" className={field} />
                <input name="category" defaultValue={editing.category} placeholder="Category (e.g. Meals)" className={field} />
                <input name="prep_minutes" type="number" min={1} max={180} defaultValue={editing.prep_minutes ?? 10} placeholder="Prep minutes" className={field} />
                <input name="counter" defaultValue={editing.counter} placeholder="Counter (e.g. Counter 1)" className={field} />
                <input name="tag" defaultValue={editing.tag ?? ""} placeholder="Tag (optional, e.g. Bestseller)" className={field} />
                <input name="stock" type="number" min={0} max={100000} defaultValue={editing.stock ?? ""} placeholder="Stock (empty = unlimited)" aria-label="Stock" className={field} />
                <textarea name="description" defaultValue={editing.description} placeholder="Description" rows={2} className={cn(field, "sm:col-span-2")} />
                <select name="image" defaultValue={editing.image} className={field}>
                  {IMAGES.map((i) => <option key={i} value={i}>{i.replace("food-", "").replace("-", " ")}</option>)}
                </select>
                <div className="flex items-center gap-5 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" name="veg" defaultChecked={editing.veg} /> Veg</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="available" defaultChecked={editing.available} /> Available</label>
                </div>
                {err && <p className="text-xs text-primary-bright sm:col-span-2">{err}</p>}
                <div className="flex gap-2 sm:col-span-2">
                  <button className="rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-border px-6 py-2.5 text-xs text-muted-foreground">Cancel</button>
                </div>
              </form>
            )}
            <div className="mt-5 space-y-3">
              {!menu.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Your menu is empty. Add your first item — it goes live for customers instantly.</p>}
              {menu.map((m) => (
                <div key={m.id} className={cn("flex items-center gap-4 rounded-3xl border border-border bg-card p-4", !m.available && "opacity-60")}>
                  <img src={foodImage(m.image)} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.category} · ₹{m.price} · {m.prep_minutes}m{m.stock != null && ` · ${m.stock} in stock`}</p>
                  </div>
                  <button onClick={() => supabase.from("menu_items").update({ available: !m.available }).eq("id", m.id).then(() => {})} className={cn("rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest", m.available ? "bg-chart-4/20 text-chart-4" : "bg-muted text-muted-foreground")}>{m.available ? "Available" : "Sold out"}</button>
                  <button aria-label="Edit" onClick={() => setEditing(m)} className="grid h-8 w-8 place-items-center rounded-full border border-border"><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label="Delete" onClick={() => { if (confirm(`Remove ${m.name}?`)) void supabase.from("menu_items").delete().eq("id", m.id).then(() => {}); }} className="grid h-8 w-8 place-items-center rounded-full border border-border"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
