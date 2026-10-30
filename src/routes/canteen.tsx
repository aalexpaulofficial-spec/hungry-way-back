import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton, useBackNavigationEnabled, useBackStep } from "@/lib/back-nav";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LogOut, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CanteenTemplatePreview } from "@/components/foodexa/CanteenTemplatePreview";
import { DEFAULT_BANNER_CROP, normalizeBannerCrop } from "@/lib/banner-crop";
import { createCanteenMenuImageUpload, getCanteenOwnerAccess, ownerUpdateOrderStatus } from "@/lib/hungry.functions";
import { ORDER_TYPE_LABELS, PAYMENT_STATUS_LABELS, type OrderType } from "@/lib/order-rules";
import { ORDER_LABELS, type MenuItem } from "@/lib/access";
import { foodImage } from "@/lib/foodexa-images";
import { cn } from "@/lib/utils";
import { backendConfigured } from "@/lib/backend-config";
import { SetupNotice } from "@/components/SetupNotice";
import { CanteenOwnerLoginForm } from "@/components/foodexa/CanteenOwnerLoginForm";
import { LanguageSelect, localizeDashboard, useDashboardLanguage } from "@/lib/dashboard-language";
import { isStandaloneApp } from "@/lib/pwa-install";

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
  const ownerAccess = useServerFn(getCanteenOwnerAccess);
  const siteNavigationEnabled = useBackNavigationEnabled();
  const [state, setState] = useState<"loading" | "auth" | "ok" | "pending" | "rejected" | "missing" | "error">("loading");
  const [canteen, setCanteen] = useState<Canteen | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const { language, saveLanguage } = useDashboardLanguage(ownerUserId);
  const [err, setErr] = useState("");

  const resolve = useCallback(async () => {
    setErr("");
    setState("loading");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error("Could not verify your owner session. Please sign in again.");
      if (!data.user) {
        setOwnerUserId(null);
        setCanteen(null);
        setState("auth");
        return;
      }
      setOwnerUserId(data.user.id);
      const access = await ownerAccess({ data: {} });
      if (access.status !== "approved") {
        setCanteen(null);
        setState(access.status);
        return;
      }
      const q = supabase
        .from("canteens")
        .select("id, code, name, university_name, visibility, is_active")
        .eq("owner_user_id", data.user.id);
      const { data: rows, error } = await q.limit(1);
      if (error) throw new Error("Could not load your canteen. Please try again.");
      const c = (rows?.[0] as Canteen | undefined) ?? null;
      setCanteen(c);
      setState(c ? "ok" : "missing");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not verify your canteen access. Please try again.");
      setState("error");
    }
  }, [ownerAccess]);

  useEffect(() => localizeDashboard(document.body, language), [language]);

  useEffect(() => {
    if (backendConfigured) resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setCanteen(null);
    setOwnerUserId(null);
    setState("auth");
  }

  if (!backendConfigured) return <SetupNotice title="Canteen dashboard isn't connected yet" />;
  if (state === "loading") return <div role="status" className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Loading…</div>;
  if (state === "ok" && canteen) return <Dashboard canteen={canteen} onSignOut={signOut} language={language} onLanguageChange={saveLanguage} />;

  return (
    <div className="grain relative min-h-screen overflow-hidden bg-background px-4 py-10">
      <div className="ember anim-pulse-glow pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2" />
      <div className="relative mx-auto w-full max-w-md">
        {siteNavigationEnabled ? (
          <Link to="/" className="mb-8 block text-center display text-[15px] tracking-[0.3em]" aria-label="HUNGRY home">HUNGRY</Link>
        ) : (
          <span className="mb-8 block text-center display text-[15px] tracking-[0.3em]" aria-label="HUNGRY">HUNGRY</span>
        )}
        <div className="glass-red anim-rise rounded-[2rem] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-bright">Canteen Dashboard</p>
          {state === "auth" ? (
            <div className="mt-4 space-y-4">
              <h1 className="display text-2xl">Canteen Owner Login</h1>
              <CanteenOwnerLoginForm initialError={err} onRegister={() => {
                window.location.href = isStandaloneApp() ? "/register-canteen?hungry_app=canteen" : "/register-canteen";
              }} />
            </div>
          ) : state === "pending" || state === "rejected" || state === "missing" ? (
            <div className="mt-4 space-y-4">
              <h1 className="display text-2xl">
                {state === "pending" ? "Application under review" : state === "rejected" ? "Application rejected" : "Application not found"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {state === "pending"
                  ? "Your canteen application is under review. We'll email you when it has been reviewed."
                  : state === "rejected"
                    ? "Your canteen application was rejected. No rejection reason is available here; contact HUNGRY support for details."
                    : "No approved canteen is linked to this account. Sign in with your 7-character Canteen Owner ID and Owner Password Code."}
              </p>
              {state === "missing" && <a href="/register-canteen" className="block text-xs font-semibold text-primary-bright underline">Register your canteen</a>}
              <button type="button" onClick={signOut} className="w-full rounded-full border border-border py-3 text-sm text-muted-foreground hover:text-foreground">Use another account</button>
            </div>
          ) : state === "error" ? (
            <div className="mt-4 space-y-4">
              <h1 className="display text-2xl">Could not load your dashboard</h1>
              <p role="alert" className="text-sm text-primary-bright">{err}</p>
              <button type="button" onClick={() => void resolve()} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground">Try again</button>
              <button type="button" onClick={signOut} className="w-full rounded-full border border-border py-3 text-sm text-muted-foreground hover:text-foreground">Sign out</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Order = { id: string; order_number: string; customer_name: string; lines: { name: string; qty: number }[]; total: number; discount: number; pickup_code: string; status: string; created_at: string; order_type: string; payment_method: string; payment_status: string };
type CanteenTemplate = { canteen_id: string; banner_image_url: string | null; heading: string; description: string; banner_crop_x: number; banner_crop_y: number; banner_crop_zoom: number; updated_at?: string };
function normalizeCanteenTemplate(value: Partial<CanteenTemplate> | null | undefined, canteenId: string): CanteenTemplate {
  const crop = normalizeBannerCrop({ x: value?.banner_crop_x, y: value?.banner_crop_y, zoom: value?.banner_crop_zoom });
  return {
    canteen_id: value?.canteen_id ?? canteenId,
    banner_image_url: value?.banner_image_url ?? null,
    heading: value?.heading ?? "",
    description: value?.description ?? "",
    banner_crop_x: crop.x,
    banner_crop_y: crop.y,
    banner_crop_zoom: crop.zoom,
    ...(value?.updated_at ? { updated_at: value.updated_at } : {}),
  };
}
const uid = () => Math.random().toString(36).slice(2);
const NEXT: Record<string, string | undefined> = { placed: "preparing", preparing: "ready", ready: "collected" };
const BANNER_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export function Dashboard({ canteen, onSignOut, language, onLanguageChange }: { canteen: Canteen; onSignOut: () => void; language: "en" | "hi" | "kn"; onLanguageChange: (language: "en" | "hi" | "kn") => void }) {
  const [tab, setTab] = useState<"menu" | "orders" | "template">("menu");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [foodImageFile, setFoodImageFile] = useState<File | null>(null);
  const [foodImagePreview, setFoodImagePreview] = useState<string | null>(null);
  const [template, setTemplate] = useState<CanteenTemplate>({ canteen_id: canteen.id, banner_image_url: null, heading: "", description: "", banner_crop_x: 50, banner_crop_y: 50, banner_crop_zoom: 1 });
  const [templateHeading, setTemplateHeading] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateImage, setTemplateImage] = useState<File | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [bannerCrop, setBannerCrop] = useState(DEFAULT_BANNER_CROP);
  useBackStep(tab !== "menu", () => setTab("menu"));
  useBackStep(!!editing, () => setEditing(null));
  const [err, setErr] = useState("");
  const [orderMsg, setOrderMsg] = useState("");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const prepareMenuImageUpload = useServerFn(createCanteenMenuImageUpload);
  const move = useServerFn(ownerUpdateOrderStatus);

  useEffect(() => () => {
    if (foodImagePreview) URL.revokeObjectURL(foodImagePreview);
  }, [foodImagePreview]);

  useEffect(() => {
    if (!templateImage) {
      setTemplatePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(templateImage);
    setTemplatePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [templateImage]);

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
    const loadTemplate = async () => {
      const { data, error } = await supabase.from("canteen_templates").select("canteen_id,banner_image_url,heading,description,banner_crop_x,banner_crop_y,banner_crop_zoom,updated_at").eq("canteen_id", canteen.id).maybeSingle();
      if (error) {
        setTemplateError("Could not load the canteen template. Apply database/007_canteen_template_crop.sql after the earlier migrations and try again.");
        return;
      }
      const loadedTemplate = normalizeCanteenTemplate(data, canteen.id);
      setTemplate(loadedTemplate);
      setTemplateHeading(loadedTemplate.heading);
      setTemplateDescription(loadedTemplate.description);
      setBannerCrop(normalizeBannerCrop({ x: loadedTemplate.banner_crop_x, y: loadedTemplate.banner_crop_y, zoom: loadedTemplate.banner_crop_zoom }));
      setTemplateError("");
    };
    loadMenu();
    loadOrders();
    loadTemplate();
    const ch = supabase
      .channel(`canteen-${canteen.id}-${uid()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `canteen_id=eq.${canteen.id}` }, loadMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `canteen_id=eq.${canteen.id}` }, loadOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "canteen_templates", filter: `canteen_id=eq.${canteen.id}` }, loadTemplate)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [canteen.id]);

  async function saveTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTemplateError("");
    const heading = templateHeading.trim();
    const description = templateDescription.trim();
    if (heading.length > 120) return setTemplateError("Keep the heading under 120 characters.");
    if (description.length > 500) return setTemplateError("Keep the description under 500 characters.");

    setSavingTemplate(true);
    let uploadedPath: string | null = null;
    try {
      let bannerImageUrl = template.banner_image_url;
      if (templateImage) {
        const extension = BANNER_IMAGE_TYPES[templateImage.type];
        if (!extension) throw new Error("Choose a JPG, PNG, WebP, or AVIF banner image.");
        if (templateImage.size > 8 * 1024 * 1024) throw new Error("Banner images must be 8 MB or smaller.");
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Sign in again before changing your canteen template.");
        uploadedPath = `${canteen.id}/${crypto.randomUUID()}.${extension}`;
        const storage = supabase.storage.from("canteen-home-banners");
        const { error: uploadError } = await storage.upload(uploadedPath, templateImage, {
          cacheControl: "3600",
          contentType: templateImage.type,
          upsert: false,
        });
        if (uploadError) throw new Error(`Could not upload the banner image: ${uploadError.message}`);
        bannerImageUrl = storage.getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error } = await supabase
        .from("canteen_templates")
        .upsert({ canteen_id: canteen.id, banner_image_url: bannerImageUrl, heading, description, banner_crop_x: bannerCrop.x, banner_crop_y: bannerCrop.y, banner_crop_zoom: bannerCrop.zoom }, { onConflict: "canteen_id" })
        .select("canteen_id,banner_image_url,heading,description,banner_crop_x,banner_crop_y,banner_crop_zoom,updated_at")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not save the canteen template.");
      const savedTemplate = normalizeCanteenTemplate(data, canteen.id);
      setTemplate(savedTemplate);
      setTemplateHeading(savedTemplate.heading);
      setTemplateDescription(savedTemplate.description);
      setBannerCrop(normalizeBannerCrop({ x: savedTemplate.banner_crop_x, y: savedTemplate.banner_crop_y, zoom: savedTemplate.banner_crop_zoom }));
      setTemplateImage(null);
      setTab("menu");
    } catch (error) {
      if (uploadedPath) {
        try {
          const { error: cleanupError } = await supabase.storage.from("canteen-home-banners").remove([uploadedPath]);
          if (cleanupError) console.warn("Could not remove the unused banner upload", cleanupError);
        } catch (cleanupError) {
          console.warn("Could not remove the unused banner upload", cleanupError);
        }
      }
      setTemplateError(error instanceof Error ? error.message : "Could not save the canteen template.");
    } finally {
      setSavingTemplate(false);
    }
  }

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
      image: String(editing?.image ?? ""),
      veg: fd.get("veg") === "on",
      available: fd.get("available") === "on",
    };
    if (!row.name || !Number.isFinite(row.price) || row.price < 0) return setErr("Enter a name and a valid price.");
    if (row.stock !== null && !Number.isFinite(row.stock)) return setErr("Stock must be a number, or empty for unlimited.");
    let uploadedPath: string | null = null;
    try {
      if (foodImageFile) {
        const mimeToExtension: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/avif": "avif",
        };
        const extension = mimeToExtension[foodImageFile.type];
        if (!extension) return setErr("Choose a JPG, PNG, WEBP, or AVIF food image.");
        if (foodImageFile.size > 8 * 1024 * 1024) return setErr("Food images must be 8 MB or smaller.");
        const uploadTarget = await prepareMenuImageUpload({
          data: {
            canteenId: canteen.id,
            contentType: foodImageFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/avif",
          },
        });
        uploadedPath = uploadTarget.path;
        const storage = supabase.storage.from("canteen-menu-images");
        const { error: uploadError } = await storage.uploadToSignedUrl(uploadedPath, uploadTarget.token, foodImageFile, {
          cacheControl: "3600",
          contentType: foodImageFile.type,
        });
        if (uploadError) throw new Error(`Could not upload the food image: ${uploadError.message}`);
        row.image = uploadTarget.publicUrl;
      }
      const result = editing?.id
        ? await supabase.from("menu_items").update(row).eq("id", editing.id).select().single()
        : await supabase.from("menu_items").insert(row).select().single();
      if (result.error) throw new Error(`Could not save the menu item: ${result.error.message}`);
      const savedItem = result.data as MenuItem;
      setMenu((current) => editing?.id
        ? current.map((item) => item.id === savedItem.id ? savedItem : item)
        : [...current, savedItem]);
    } catch (e) {
      if (uploadedPath) await supabase.storage.from("canteen-menu-images").remove([uploadedPath]);
      return setErr(e instanceof Error ? e.message : "Could not save the menu item. Please try again.");
    }
    setEditing(null);
    setFoodImageFile(null);
    setFoodImagePreview(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
          <BackButton inline />
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.3em] text-primary-bright">CANTEEN DASHBOARD · {canteen.code}</p>
            <h1 data-no-translate className="display text-3xl">{canteen.name}</h1>
            <p className="text-sm text-muted-foreground"><span data-no-translate>{canteen.university_name}</span> · <span className="capitalize">{canteen.visibility}</span></p>
          </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelect language={language} onChange={onLanguageChange} />
            <button onClick={onSignOut} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" /> Log out</button>
          </div>
        </header>
        {canteen.visibility === "maintenance" && <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm text-primary-bright">Your canteen is in maintenance mode — customers can't place orders.</p>}
        <div className="mt-6 flex gap-2">
          {([['menu', `Menu (${menu.length})`], ['orders', `Live Orders (${orders.filter((o) => o.status !== "collected" && o.status !== "cancelled").length})`], ['template', "Change Template"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-full border px-4 py-2 text-xs font-semibold", tab === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{l}</button>
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
                <p data-no-translate className="mt-2 text-sm">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
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
        ) : tab === "template" ? (
          <form onSubmit={saveTemplate} className="glass-red mt-6 grid gap-4 rounded-3xl p-5">
            <div>
              <h2 className="display text-xl">Student Home Banner</h2>
              <p className="mt-1 text-sm text-muted-foreground">Customize the banner students see on this canteen's Home page.</p>
            </div>
            <label className="space-y-2">
              <span className="block text-xs font-semibold text-foreground">Banner image (JPG, PNG, WebP, or AVIF; max 8 MB)</span>
              <input
                type="file"
                name="templateImage"
                accept="image/jpeg,image/png,image/webp,image/avif"
                aria-label="Choose canteen banner image"
                onChange={(event) => {
                  setTemplateImage(event.currentTarget.files?.[0] ?? null);
                  setBannerCrop(DEFAULT_BANNER_CROP);
                }}
                className={cn(field, "file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground")}
              />
            </label>
            <input name="templateHeading" maxLength={120} value={templateHeading} onChange={(event) => setTemplateHeading(event.currentTarget.value)} placeholder="Heading (optional)" className={field} />
            <textarea name="templateDescription" maxLength={500} value={templateDescription} onChange={(event) => setTemplateDescription(event.currentTarget.value)} placeholder="Description (optional)" rows={3} className={field} />
            <CanteenTemplatePreview imageUrl={templatePreview ?? template.banner_image_url} heading={templateHeading} description={templateDescription} canteenName={canteen.name} universityName={canteen.university_name} crop={bannerCrop} onCropChange={setBannerCrop} />
            {templateError && <p role="alert" className="text-sm text-primary-bright">{templateError}</p>}
            <div className="flex gap-2">
              <button disabled={savingTemplate} className="rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">{savingTemplate ? "Saving template…" : "Save template"}</button>
              <button type="button" disabled={savingTemplate} onClick={() => { setTemplateImage(null); setTemplateError(""); setTab("menu"); }} className="rounded-full border border-border px-6 py-2.5 text-xs text-muted-foreground disabled:opacity-60">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="mt-6">
            <button onClick={() => { setFoodImageFile(null); setFoodImagePreview(null); setEditing({ veg: true, available: true }); }} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add item</button>
            {editing && (
              <form key={editing.id ?? "new"} onSubmit={save} className="glass-red mt-4 grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
                <input name="name" defaultValue={editing.name} placeholder="Item name" className={field} />
                <input name="price" type="number" min={0} defaultValue={editing.price} placeholder="Price (₹)" className={field} />
                <input name="category" defaultValue={editing.category} placeholder="Category (e.g. Meals)" className={field} />
                <input name="prep_minutes" type="number" min={1} max={180} defaultValue={editing.prep_minutes ?? ""} placeholder="Preparation minutes" className={field} />
                <input name="counter" defaultValue={editing.counter} placeholder="Counter (e.g. Counter 1)" className={field} />
                <input name="tag" defaultValue={editing.tag ?? ""} placeholder="Tag (optional, e.g. Bestseller)" className={field} />
                <input name="stock" type="number" min={0} max={100000} defaultValue={editing.stock ?? ""} placeholder="Stock (empty = unlimited)" aria-label="Stock" className={field} />
                <textarea name="description" defaultValue={editing.description} placeholder="Description" rows={2} className={cn(field, "sm:col-span-2")} />
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="food-image-upload" className="block text-xs font-semibold text-foreground">Upload Food Image</label>
                  <input
                    id="food-image-upload"
                    name="food_image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-label="Choose food image file"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      setFoodImageFile(file);
                      setFoodImagePreview(file ? URL.createObjectURL(file) : null);
                    }}
                    className={cn(field, "file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground")}
                  />
                  {(foodImagePreview || editing.image) && <img src={foodImagePreview ?? foodImage(editing.image)} alt={foodImagePreview ? "Selected food image preview" : "Current food image"} className="h-32 w-32 rounded-2xl border border-border object-cover" />}
                  <p className="text-xs text-muted-foreground">Choose a JPG, PNG, WEBP, or AVIF image (up to 8 MB).</p>
                </div>
                <div className="flex items-center gap-5 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" name="veg" defaultChecked={editing.veg} /> Veg</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="available" defaultChecked={editing.available} /> Available</label>
                </div>
                {err && <p className="text-xs text-primary-bright sm:col-span-2">{err}</p>}
                <div className="flex gap-2 sm:col-span-2">
                  <button className="rounded-full bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground">Save</button>
                  <button type="button" onClick={() => { setEditing(null); setFoodImageFile(null); setFoodImagePreview(null); }} className="rounded-full border border-border px-6 py-2.5 text-xs text-muted-foreground">Cancel</button>
                </div>
              </form>
            )}
            <div className="mt-5 space-y-3">
              {!menu.length && <p className="rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Your menu is empty. Add your first item — it goes live for customers instantly.</p>}
              {menu.map((m) => (
                <div key={m.id} className={cn("flex items-center gap-4 rounded-3xl border border-border bg-card p-4", !m.available && "opacity-60")}>
                  <img src={foodImage(m.image)} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <p data-no-translate className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground"><span data-no-translate>{m.category}</span> · ₹{m.price} · {m.prep_minutes}m{m.stock != null && <> · {m.stock} <span>in stock</span></>}</p>
                  </div>
                  <button onClick={() => supabase.from("menu_items").update({ available: !m.available }).eq("id", m.id).then(() => {})} className={cn("rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest", m.available ? "bg-chart-4/20 text-chart-4" : "bg-muted text-muted-foreground")}>{m.available ? "Available" : "Sold out"}</button>
                  <button aria-label="Edit" onClick={() => { setFoodImageFile(null); setFoodImagePreview(null); setEditing(m); }} className="grid h-8 w-8 place-items-center rounded-full border border-border"><Pencil className="h-3.5 w-3.5" /></button>
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
