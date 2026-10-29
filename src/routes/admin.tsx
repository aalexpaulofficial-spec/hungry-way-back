import { createFileRoute } from "@tanstack/react-router";
import { BackButton, useBackStep } from "@/lib/back-nav";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, LogOut, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminLogin, approveApplication, approveRefund, createCoupon, rejectApplication, rejectRefund, setCanteenVisibility, setCouponActive } from "@/lib/hungry.functions";
import { REFUND_STATUS_LABELS } from "@/lib/order-rules";
import { visibilities, type Visibility } from "@/lib/access";
import { cn } from "@/lib/utils";
import { backendConfigured } from "@/lib/backend-config";
import { SetupNotice } from "@/components/SetupNotice";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "HUNGRY Admin" },
      { name: "description", content: "HUNGRY administration." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "HUNGRY Admin" },
      { property: "og:description", content: "HUNGRY administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const field =
  "w-full rounded-2xl border border-input bg-ink-soft px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary";

function AdminPage() {
  const [state, setState] = useState<"loading" | "login" | "ok">("loading");
  const check = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setState("login");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    setState(isAdmin ? "ok" : "login");
  }, []);
  useEffect(() => {
    if (backendConfigured) check();
  }, [check]);
  if (!backendConfigured) return <SetupNotice title="Admin isn't connected yet" />;
  if (state === "loading") return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</div>;
  if (state === "login") return <AdminLogin onDone={check} />;
  return <Dashboard onSignOut={async () => { await supabase.auth.signOut(); setState("login"); }} />;
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const login = useServerFn(adminLogin);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setErr("");
    setBusy(true);
    try {
      await login({ data: { email, password } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Sign-in failed");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid admin credentials.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grain relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      <div className="ember anim-pulse-glow pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2" />
      <form onSubmit={submit} className="glass-red anim-rise relative w-full max-w-sm space-y-4 rounded-[2rem] p-8">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary-bright" />
        <h1 className="display text-center text-2xl">Admin Login</h1>
        <input name="email" type="email" placeholder="Admin email" autoComplete="username" className={field} />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" className={field} />
        {err && <p className="text-center text-xs text-primary-bright">{err}</p>}
        <button disabled={busy} className="w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Verifying…" : "Login"}</button>
        <a href="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back to HUNGRY</a>
      </form>
    </div>
  );
}

type App = { id: string; owner_name: string; owner_phone: string; canteen_name: string; university_name: string; campus_location: string; contact_email: string; fssai_license: string; owner_id_proof: string; notes: string | null; status: string; created_at: string };
type Canteen = { id: string; code: string; name: string; university_name: string; contact_email: string; visibility: string; owner_user_id: string | null };

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const approve = useServerFn(approveApplication);
  const reject = useServerFn(rejectApplication);
  const setVis = useServerFn(setCanteenVisibility);
  const [tab, setTab] = useState<"pending" | "reviewed" | "canteens" | "refunds" | "coupons" | "payments" | "emails">("pending");
  useBackStep(tab !== "pending", () => setTab("pending"));
  const [apps, setApps] = useState<App[]>([]);
  const [canteens, setCanteens] = useState<Canteen[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from("canteen_applications").select("*").order("created_at", { ascending: false }),
      supabase.from("canteens").select("id, code, name, university_name, contact_email, visibility, owner_user_id").order("created_at", { ascending: false }),
    ]);
    setApps((a as App[]) ?? []);
    setCanteens((c as Canteen[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, fn: () => Promise<string>) {
    setBusy(id);
    setMsg("");
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const list = apps.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending"));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
          <BackButton inline />
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.3em] text-primary-bright">HUNGRY ADMIN</p>
            <h1 className="display text-3xl">Canteen applications</h1>
          </div>
          </div>
          <button onClick={onSignOut} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" /> Log out</button>
        </header>
        <div className="mt-6 flex flex-wrap gap-2">
          {([["pending", `Pending (${apps.filter((a) => a.status === "pending").length})`], ["reviewed", "Reviewed"], ["canteens", `Canteens (${canteens.length})`], ["refunds", "Refunds"], ["coupons", "Coupons"], ["payments", "Payments"], ["emails", "Email log"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-full border px-4 py-2 text-xs font-semibold", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{l}</button>
          ))}
        </div>
        {msg && <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm">{msg}</p>}

        {tab === "refunds" ? (
          <RefundsPanel />
        ) : tab === "coupons" ? (
          <CouponsPanel canteens={canteens} />
        ) : tab === "payments" ? (
          <PaymentsPanel />
        ) : tab === "emails" ? (
          <EmailLogPanel />
        ) : tab !== "canteens" ? (
          <div className="mt-6 space-y-4">
            {!list.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No applications here.</p>}
            {list.map((a) => (
              <div key={a.id} className="rounded-3xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="display text-xl">{a.canteen_name}</p>
                    <p className="text-sm text-muted-foreground">{a.university_name} · {a.campus_location}</p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", a.status === "approved" ? "bg-chart-4/20 text-chart-4" : a.status === "rejected" ? "bg-primary/20 text-primary-bright" : "bg-muted text-muted-foreground")}>{a.status}</span>
                </div>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {([["Owner", a.owner_name], ["Phone", a.owner_phone], ["Email", a.contact_email], ["FSSAI", a.fssai_license], ["Owner ID", a.owner_id_proof], ["Submitted", new Date(a.created_at).toLocaleString()]] as const).map(([k, v]) => (
                    <div key={k}><dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>
                  ))}
                </dl>
                {a.notes && <p className="mt-3 text-sm text-muted-foreground">“{a.notes}”</p>}
                {a.status === "pending" && (
                  <div className="mt-5 flex gap-2">
                    <button disabled={busy === a.id} onClick={() => act(a.id, async () => { const r = await approve({ data: { id: a.id } }); return `Approved ${a.canteen_name}. Code: ${r.code}. ${r.emailSent ? "Code emailed to the canteen." : "Email could not be sent — share this code with the canteen manually."}`; })} className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button>
                    <button disabled={busy === a.id} onClick={() => act(a.id, async () => { await reject({ data: { id: a.id } }); return `Rejected ${a.canteen_name}.`; })} className="flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-50"><X className="h-4 w-4" /> Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {!canteens.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No approved canteens yet.</p>}
            {canteens.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-card p-5">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.university_name} · {c.contact_email}</p>
                  <p className="mt-1 font-mono text-sm tracking-[0.3em] text-primary-bright">{c.code}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.owner_user_id ? "Dashboard linked" : "Owner not signed in yet"}</p>
                </div>
                <div className="flex rounded-full bg-ink p-1">
                  {visibilities.map((v) => (
                    <button key={v} disabled={busy === c.id} onClick={() => act(c.id, async () => { await setVis({ data: { id: c.id, visibility: v as Visibility } }); return `${c.name} set to ${v}.`; })} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize", c.visibility === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Refunds ---------------- */
type RefundRow = { id: string; order_id: string; amount: number; reason: string; status: string; requested_by: string; razorpay_refund_id: string | null; admin_note: string | null; created_at: string; orders: { order_number: string; customer_name: string } | null };

function RefundsPanel() {
  const approve = useServerFn(approveRefund);
  const reject = useServerFn(rejectRefund);
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("refunds").select("*, orders(order_number, customer_name)").order("created_at", { ascending: false }).limit(200);
    setRows((data as unknown as RefundRow[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel(`admin-refunds-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, load).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  async function act(id: string, fn: () => Promise<string>) {
    setBusy(id);
    setMsg("");
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-6 space-y-3">
      {msg && <p className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm">{msg}</p>}
      {!rows.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No refund requests.</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-sm font-bold">{r.orders?.order_number ?? r.order_id.slice(0, 8)} · ₹{r.amount}</p>
            <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-widest">{REFUND_STATUS_LABELS[r.status] ?? r.status}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{r.orders?.customer_name} · by {r.requested_by} · {new Date(r.created_at).toLocaleString()}</p>
          <p className="mt-2 text-sm">“{r.reason}”</p>
          {r.razorpay_refund_id && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{r.razorpay_refund_id}</p>}
          {r.admin_note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.admin_note}</p>}
          {(r.status === "requested" || r.status === "failed") && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy === r.id} onClick={() => act(r.id, async () => { await approve({ data: { id: r.id } }); return "Refund sent to Razorpay."; })} className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" /> {r.status === "failed" ? "Retry refund" : "Approve & refund"}</button>
              {r.status === "requested" && (
                <button disabled={busy === r.id} onClick={() => { const note = window.prompt("Reason for declining (sent to the customer):", "") ?? ""; void act(r.id, async () => { await reject({ data: { id: r.id, note } }); return "Refund declined."; }); }} className="flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground disabled:opacity-50"><X className="h-4 w-4" /> Decline</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Coupons ---------------- */
type CouponRow = { id: string; code: string; description: string; discount_type: string; discount_value: number; max_discount: number | null; min_order_value: number; expires_at: string | null; usage_limit: number | null; per_user_limit: number; active: boolean; first_order_only: boolean; canteen_id: string | null; eligible_roles: string[] | null };

function CouponsPanel({ canteens }: { canteens: Canteen[] }) {
  const create = useServerFn(createCoupon);
  const toggle = useServerFn(setCouponActive);
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [uses, setUses] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [{ data }, { data: red }] = await Promise.all([
      supabase.from("coupons").select("*").order("created_at", { ascending: false }),
      supabase.from("coupon_redemptions").select("coupon_id, status").in("status", ["reserved", "used"]),
    ]);
    setRows((data as CouponRow[]) ?? []);
    const u: Record<string, number> = {};
    (red ?? []).forEach((r) => (u[r.coupon_id] = (u[r.coupon_id] ?? 0) + 1));
    setUses(u);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : Number(fd.get(k)));
    const date = (k: string) => (String(fd.get(k) ?? "") ? new Date(String(fd.get(k))).toISOString() : null);
    const roles = ["student", "faculty", "guest"].filter((r) => fd.get(`role_${r}`) === "on") as ("student" | "faculty" | "guest")[];
    setBusy(true);
    setMsg("");
    try {
      await create({
        data: {
          code: String(fd.get("code") ?? "").trim().toUpperCase(),
          description: String(fd.get("description") ?? ""),
          discountType: fd.get("discountType") === "flat" ? "flat" : "percent",
          discountValue: Number(fd.get("discountValue")),
          maxDiscount: num("maxDiscount"),
          minOrderValue: num("minOrderValue") ?? 0,
          startsAt: date("startsAt"),
          expiresAt: date("expiresAt"),
          usageLimit: num("usageLimit"),
          perUserLimit: num("perUserLimit") ?? 1,
          canteenId: String(fd.get("canteenId") ?? "") || null,
          eligibleRoles: roles.length === 3 ? null : roles,
          firstOrderOnly: fd.get("firstOrderOnly") === "on",
        },
      });
      setMsg("Coupon created.");
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not create coupon");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <form onSubmit={submit} className="glass-red grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <input name="code" required placeholder="CODE (e.g. WELCOME10)" className={cn(field, "font-mono uppercase")} maxLength={20} />
        <input name="description" placeholder="Description" className={field} maxLength={200} />
        <select name="discountType" className={field} defaultValue="percent"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select>
        <input name="discountValue" type="number" min={1} required placeholder="Discount value (% or ₹)" className={field} />
        <input name="maxDiscount" type="number" min={1} placeholder="Max discount ₹ (optional)" className={field} />
        <input name="minOrderValue" type="number" min={0} placeholder="Minimum order ₹ (default 0)" className={field} />
        <label className="text-xs text-muted-foreground">Starts (optional)<input name="startsAt" type="datetime-local" className={cn(field, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Expires (optional)<input name="expiresAt" type="datetime-local" className={cn(field, "mt-1")} /></label>
        <input name="usageLimit" type="number" min={1} placeholder="Total uses (empty = unlimited)" className={field} />
        <input name="perUserLimit" type="number" min={1} defaultValue={1} placeholder="Uses per customer" className={field} />
        <select name="canteenId" className={field} defaultValue=""><option value="">All canteens</option>{canteens.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {["student", "faculty", "guest"].map((r) => <label key={r} className="flex items-center gap-1.5 capitalize"><input type="checkbox" name={`role_${r}`} defaultChecked /> {r}</label>)}
          <label className="flex items-center gap-1.5"><input type="checkbox" name="firstOrderOnly" /> First order only</label>
        </div>
        {msg && <p className="text-xs text-primary-bright sm:col-span-2">{msg}</p>}
        <button disabled={busy} className="rounded-full bg-primary px-6 py-3 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2">{busy ? "Saving…" : "Create coupon"}</button>
      </form>
      {!rows.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No coupons yet.</p>}
      {rows.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5">
          <div>
            <p className="font-mono text-sm font-bold tracking-widest">{c.code}</p>
            <p className="text-xs text-muted-foreground">
              {c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}{c.max_discount ? ` (max ₹${c.max_discount})` : ""} · min ₹{c.min_order_value} · used {uses[c.id] ?? 0}{c.usage_limit ? `/${c.usage_limit}` : ""} · {c.per_user_limit}/customer{c.first_order_only ? " · first order" : ""}{c.expires_at ? ` · ends ${new Date(c.expires_at).toLocaleString()}` : ""}
            </p>
          </div>
          <button onClick={async () => { await toggle({ data: { id: c.id, active: !c.active } }); await load(); }} className={cn("rounded-full px-4 py-2 text-[11px] font-semibold", c.active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground")}>{c.active ? "Active" : "Inactive"}</button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Payments ---------------- */
type PaymentRow = { id: string; razorpay_payment_id: string; razorpay_order_id: string; amount_paise: number; status: string; method: string | null; error_description: string | null; signature_verified: boolean; created_at: string; orders: { order_number: string } | null };

function PaymentsPanel() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  useEffect(() => {
    supabase.from("payments").select("*, orders(order_number)").order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows((data as unknown as PaymentRow[]) ?? []));
  }, []);
  return (
    <div className="mt-6 space-y-2">
      {!rows.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No online payments yet.</p>}
      {rows.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <div className="min-w-0">
            <p className="font-mono font-bold">{p.orders?.order_number} · ₹{p.amount_paise / 100}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{p.razorpay_payment_id} · {p.method ?? "—"} · {new Date(p.created_at).toLocaleString()}</p>
            {p.error_description && <p className="text-xs text-primary-bright">{p.error_description}</p>}
          </div>
          <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", p.status === "captured" ? "bg-chart-4/20 text-chart-4" : p.status === "failed" ? "bg-primary/20 text-primary-bright" : "bg-muted text-muted-foreground")}>{p.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Email log ---------------- */
type EmailRow = { id: string; kind: string; recipient: string; subject: string; status: string; error: string | null; attempts: number; created_at: string };

function EmailLogPanel() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  useEffect(() => {
    supabase.from("email_logs").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => setRows((data as EmailRow[]) ?? []));
  }, []);
  return (
    <div className="mt-6 space-y-2">
      {!rows.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No emails sent yet.</p>}
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{r.subject}</p>
            <span className={cn("rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest", r.status === "sent" ? "bg-chart-4/20 text-chart-4" : r.status === "failed" ? "bg-primary/20 text-primary-bright" : "bg-muted text-muted-foreground")}>{r.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.kind} → {r.recipient} · {new Date(r.created_at).toLocaleString()} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}</p>
          {r.error && <p className="mt-1 text-xs text-primary-bright">{r.error}</p>}
        </div>
      ))}
    </div>
  );
}
