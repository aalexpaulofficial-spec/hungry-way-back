import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  accessCodeSchema,
  applicationSchema,
  canAcceptOrders,
  generateCanteenCode,
  visibilities,
} from "@/lib/access";
import { couponCodeSchema } from "@/lib/coupons";
import {
  ORDER_TYPES,
  PAYMENT_METHODS,
  canOwnerMove,
  canRequestRefund,
  friendlyOrderError,
  isPaymentAllowed,
  mergeLines,
} from "@/lib/order-rules";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const ADMIN_EMAIL = "aalexpaulofficial@gmail.com";

/* ---------------- Public: canteen application ---------------- */
export const submitCanteenApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => applicationSchema.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db
      .from("canteen_applications")
      .select("id", { count: "exact", head: true })
      .eq("contact_email", data.contactEmail.toLowerCase())
      .eq("status", "pending");
    if ((count ?? 0) >= 3) throw new Error("You already have applications under review for this email.");
    const { error } = await db.from("canteen_applications").insert({
      owner_name: data.ownerName,
      owner_phone: data.ownerPhone,
      canteen_name: data.canteenName,
      university_name: data.universityName,
      campus_location: data.campusLocation,
      contact_email: data.contactEmail.toLowerCase(),
      fssai_license: data.fssaiLicense,
      owner_id_proof: data.ownerIdProof,
      notes: data.notes || null,
    });
    if (error) throw new Error("Could not submit your application. Please try again.");
    return { ok: true };
  });

/* ---------------- Public: admin login (server-verified) ---------------- */
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().max(255), password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const secret = process.env["ADMIN_PASSWORD"];
    if (!secret) throw new Error("Admin access is not configured yet.");
    const ok = safeEqual(data.email.toLowerCase(), ADMIN_EMAIL) && safeEqual(data.password, secret);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800));
      throw new Error("Invalid admin credentials.");
    }
    const db = await admin();
    let userId: string | undefined;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = list?.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL)?.id;
      if (!list || list.users.length < 200) break;
    }
    if (!userId) {
      const { data: created, error } = await db.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: secret,
        email_confirm: true,
      });
      if (error || !created.user) throw new Error("Could not prepare admin account.");
      userId = created.user.id;
    } else {
      await db.auth.admin.updateUserById(userId, { password: secret, email_confirm: true });
    }
    await db.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    return { ok: true };
  });

/* ---------------- Admin actions ---------------- */
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const approveApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: app } = await db.from("canteen_applications").select("*").eq("id", data.id).maybeSingle();
    if (!app) throw new Error("Application not found");
    if (app.status !== "pending") throw new Error("Application was already reviewed");
    let code = "";
    for (let i = 0; i < 10; i++) {
      const c = generateCanteenCode();
      const { count } = await db.from("canteens").select("id", { count: "exact", head: true }).eq("code", c);
      if (!count) {
        code = c;
        break;
      }
    }
    if (!code) throw new Error("Could not generate a unique code, try again");
    // Claim the application first so two admins can't approve it twice.
    const { data: claimed } = await db
      .from("canteen_applications")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) throw new Error("Application was already reviewed");
    const { error } = await db.from("canteens").insert({
      code,
      application_id: app.id,
      name: app.canteen_name,
      university_name: app.university_name,
      campus_location: app.campus_location,
      contact_email: app.contact_email,
    });
    if (error) {
      await db.from("canteen_applications").update({ status: "pending", reviewed_at: null }).eq("id", app.id);
      throw new Error("Could not create canteen");
    }
    const { sendCanteenEmail } = await import("@/lib/canteen-email.server");
    const email = await sendCanteenEmail("approved", app.contact_email, {
      canteenName: app.canteen_name,
      university: app.university_name,
      code,
    }, app.id);
    return { code, emailSent: email.sent };
  });

export const rejectApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: app } = await db
      .from("canteen_applications")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (!app) throw new Error("Application not pending");
    const { sendCanteenEmail } = await import("@/lib/canteen-email.server");
    const email = await sendCanteenEmail("rejected", app.contact_email, { canteenName: app.canteen_name, university: app.university_name }, app.id);
    return { ok: true, emailSent: email.sent };
  });

export const setCanteenVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), visibility: z.enum(visibilities) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { error } = await db.from("canteens").update({ visibility: data.visibility }).eq("id", data.id);
    if (error) throw new Error("Could not update canteen");
    return { ok: true };
  });

const couponInput = z
  .object({
    code: couponCodeSchema,
    description: z.string().trim().max(200).default(""),
    discountType: z.enum(["percent", "flat"]),
    discountValue: z.number().int().min(1).max(100000),
    maxDiscount: z.number().int().min(1).max(100000).nullable(),
    minOrderValue: z.number().int().min(0).max(100000),
    startsAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    usageLimit: z.number().int().min(1).max(1000000).nullable(),
    perUserLimit: z.number().int().min(1).max(100),
    canteenId: z.string().uuid().nullable(),
    eligibleRoles: z.array(z.enum(["student", "faculty", "guest"])).max(3).nullable(),
    firstOrderOnly: z.boolean(),
  })
  .refine((v) => v.discountType !== "percent" || v.discountValue <= 100, { message: "Percent discounts must be 1–100", path: ["discountValue"] })
  .refine((v) => !v.startsAt || !v.expiresAt || new Date(v.expiresAt) > new Date(v.startsAt), { message: "Expiry must be after start", path: ["expiresAt"] });

export const createCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => couponInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { error } = await db.from("coupons").insert({
      code: data.code,
      description: data.description,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      max_discount: data.maxDiscount,
      min_order_value: data.minOrderValue,
      starts_at: data.startsAt,
      expires_at: data.expiresAt,
      usage_limit: data.usageLimit,
      per_user_limit: data.perUserLimit,
      canteen_id: data.canteenId,
      eligible_roles: data.eligibleRoles && data.eligibleRoles.length ? data.eligibleRoles : null,
      first_order_only: data.firstOrderOnly,
    });
    if (error) throw new Error(error.code === "23505" ? "A coupon with this code already exists." : "Could not create coupon.");
    return { ok: true };
  });

export const setCouponActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { error } = await db.from("coupons").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error("Could not update coupon.");
    return { ok: true };
  });

export const approveRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { startRefund } = await import("@/lib/orders.server");
    return startRefund(data.id);
  });

export const rejectRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), note: z.string().trim().max(500).default("") }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: r } = await db
      .from("refunds")
      .update({ status: "rejected", admin_note: data.note || null })
      .eq("id", data.id)
      .eq("status", "requested")
      .select("*")
      .maybeSingle();
    if (!r) throw new Error("This refund isn't awaiting review.");
    const { data: o } = await db.from("orders").select("order_number, customer_name, user_id").eq("id", r.order_id).maybeSingle();
    const { data: p } = await db.from("profiles").select("email").eq("id", r.user_id).maybeSingle();
    if (o && p?.email) {
      const { sendEmail } = await import("@/lib/mailer.server");
      const { refundRejectedEmail } = await import("@/lib/email-templates");
      await sendEmail("refund_rejected", p.email, refundRejectedEmail({ customerName: o.customer_name, orderNumber: o.order_number, amount: r.amount, note: data.note }), r.id);
    }
    return { ok: true };
  });

/* ---------------- Customers ---------------- */
async function setCurrentCanteen(userId: string, canteenId: string) {
  const db = await admin();
  const { data: p } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!p) throw new Error("Only student, faculty and guest accounts can join a canteen.");
  await db.from("profiles").update({ current_canteen_id: canteenId }).eq("id", userId);
}

export const ensureWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendWelcomeOnce } = await import("@/lib/orders.server");
    return sendWelcomeOnce(context.userId);
  });

export const joinCanteenByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: accessCodeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: c } = await db
      .from("canteens")
      .select("id, name, university_name, visibility, is_active")
      .eq("code", data.code)
      .maybeSingle();
    if (!c || !c.is_active) throw new Error("This code isn't an approved HUNGRY canteen code.");
    if (c.visibility === "maintenance") throw new Error("This canteen is in maintenance mode right now. Try again later.");
    await setCurrentCanteen(context.userId, c.id);
    return { name: c.name, university: c.university_name, visibility: c.visibility };
  });

export const listPublicCanteens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await admin();
    const { data } = await db
      .from("canteens")
      .select("id, name, university_name, campus_location")
      .eq("visibility", "public")
      .eq("is_active", true)
      .order("university_name");
    return data ?? [];
  });

export const joinPublicCanteen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: c } = await db.from("canteens").select("id, visibility, is_active").eq("id", data.id).maybeSingle();
    if (!c || !c.is_active || c.visibility !== "public") throw new Error("This canteen needs its code to join.");
    await setCurrentCanteen(context.userId, c.id);
    return { ok: true };
  });

export const getPaymentConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { razorpayKeys } = await import("@/lib/razorpay.server");
    const k = razorpayKeys();
    return { onlineEnabled: k.configured, testMode: k.testMode };
  });

const linesSchema = z.array(z.object({ id: z.string().uuid(), qty: z.number().int().min(1).max(20) })).min(1).max(30);

/** Prices the cart from the database and checks the coupon. Nothing is reserved. */
async function priceCart(userId: string, rawLines: { id: string; qty: number }[], couponCode?: string | null) {
  const db = await admin();
  const { data: p } = await db.from("profiles").select("full_name, role, current_canteen_id").eq("id", userId).maybeSingle();
  if (!p?.current_canteen_id) throw new Error("Join a canteen first.");
  const { data: c } = await db.from("canteens").select("id, is_active, visibility").eq("id", p.current_canteen_id).maybeSingle();
  if (!canAcceptOrders(c)) throw new Error("This canteen isn't accepting orders right now.");
  const lines = mergeLines(rawLines);
  if (lines.some((l) => l.qty > 20)) throw new Error("Each item can be ordered 1–20 times.");
  const { data: items } = await db
    .from("menu_items")
    .select("id, price, available, stock")
    .eq("canteen_id", c!.id)
    .in("id", lines.map((l) => l.id));
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  let subtotal = 0;
  for (const l of lines) {
    const it = byId.get(l.id);
    if (!it || !it.available) throw new Error("Some items are no longer available. Please review your cart.");
    if (it.stock != null && it.stock < l.qty) throw new Error("Some items just sold out. Please review your cart.");
    subtotal += it.price * l.qty;
  }
  let coupon: { id: string; code: string; description: string } | null = null;
  let discount = 0;
  let couponError: string | null = null;
  if (couponCode) {
    const { evaluateCouponFor } = await import("@/lib/coupons.server");
    const r = await evaluateCouponFor({ code: couponCode, userId, canteenId: c!.id, role: p.role, subtotal });
    if (r.result.ok && r.coupon) {
      coupon = { id: r.coupon.id, code: r.coupon.code, description: r.coupon.description };
      discount = r.result.discount;
    } else if (!r.result.ok) couponError = r.result.message;
  }
  return { profile: p, canteenId: c!.id, lines, subtotal, discount, total: subtotal - discount, coupon, couponError };
}

export const quoteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lines: linesSchema, couponCode: couponCodeSchema.nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const q = await priceCart(context.userId, data.lines, data.couponCode);
    return {
      subtotal: q.subtotal,
      discount: q.discount,
      total: q.total,
      coupon: q.coupon ? { code: q.coupon.code, description: q.coupon.description } : null,
      couponError: q.couponError,
    };
  });

function pickupCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000 + (a[0]! % 9000));
}

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lines: linesSchema,
        orderType: z.enum(ORDER_TYPES),
        paymentMethod: z.enum(PAYMENT_METHODS),
        couponCode: couponCodeSchema.nullable().optional(),
        idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!isPaymentAllowed(data.orderType, data.paymentMethod)) throw new Error("Parcel orders are paid at the counter.");
    const db = await admin();
    const { razorpayKeys } = await import("@/lib/razorpay.server");
    if (data.paymentMethod === "razorpay" && !razorpayKeys().configured)
      throw new Error("Online payment isn't available yet. Please choose Pay at counter.");
    await db.rpc("hungry_expire_stale_orders", { p_minutes: 30 });

    // Same checkout submitted twice: return the original order instead of creating a new one.
    const { data: existing } = await db.from("orders").select("id").eq("user_id", context.userId).eq("idempotency_key", data.idempotencyKey).maybeSingle();
    let orderId = existing?.id ?? null;
    let created = false;

    if (!orderId) {
      const q = await priceCart(context.userId, data.lines, data.couponCode);
      if (data.couponCode && !q.coupon) throw new Error(q.couponError ?? "This coupon can't be used.");
      for (let attempt = 0; attempt < 3 && !orderId; attempt++) {
        const { data: rows, error } = await db.rpc("hungry_place_order", {
          p_user: context.userId,
          p_canteen: q.canteenId,
          p_customer_name: q.profile.full_name,
          p_lines: q.lines,
          p_order_type: data.orderType,
          p_payment_method: data.paymentMethod,
          p_expected_subtotal: q.subtotal,
          p_coupon_id: (q.coupon?.id ?? null) as string, // NULL = no coupon
          p_discount: q.discount,
          p_idempotency_key: data.idempotencyKey,
          p_order_number: "HG-" + generateCanteenCode().slice(0, 6),
          p_pickup_code: pickupCode(),
        });
        if (error) {
          if (error.message.includes("orders_order_number_key")) continue; // rare number clash — retry
          throw new Error(friendlyOrderError(error.message) ?? "Could not place order. Please try again.");
        }
        const row = (rows as { order_id: string; already_existed: boolean }[] | null)?.[0];
        if (!row) throw new Error("Could not place order. Please try again.");
        orderId = row.order_id;
        created = !row.already_existed;
      }
      if (!orderId) throw new Error("Could not place order. Please try again.");
    }

    const orders = await import("@/lib/orders.server");
    const order = await orders.getOrder(orderId);
    if (!order) throw new Error("Could not load your order.");

    if (order.payment_method === "razorpay" && order.status === "pending_payment") {
      try {
        return { orderId: order.id, payment: await orders.checkoutParams(order) };
      } catch (e) {
        console.error("[placeOrder] could not create Razorpay order", e instanceof Error ? e.message : e);
        if (created) await db.rpc("hungry_release_order", { p_order: order.id, p_payment_status: "failed" });
        throw new Error("We couldn't start the payment and nothing was charged. Please try again or choose Pay at counter.");
      }
    }
    if (created) await orders.sendOrderConfirmation(order.id);
    return { orderId: order.id, payment: null };
  });

async function ownOrder(userId: string, orderId: string) {
  const { getOrder } = await import("@/lib/orders.server");
  const o = await getOrder(orderId);
  if (!o || o.user_id !== userId) throw new Error("Order not found");
  return o;
}

export const resumePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const o = await ownOrder(context.userId, data.orderId);
    if (o.status !== "pending_payment") throw new Error("This order doesn't need payment.");
    const { checkoutParams } = await import("@/lib/orders.server");
    return checkoutParams(o);
  });

const rzpId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`));

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ razorpayOrderId: rzpId("order"), razorpayPaymentId: rzpId("pay"), signature: z.string().regex(/^[a-f0-9]{64}$/i) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: o } = await db.from("orders").select("id, user_id").eq("razorpay_order_id", data.razorpayOrderId).maybeSingle();
    if (!o || o.user_id !== context.userId) throw new Error("Order not found");
    const { verifyCheckoutSignature } = await import("@/lib/razorpay-signature");
    const valid = await verifyCheckoutSignature({
      orderId: data.razorpayOrderId,
      paymentId: data.razorpayPaymentId,
      signature: data.signature,
      secret: (process.env["RAZORPAY_KEY_SECRET"] ?? "").trim(),
    });
    if (!valid) throw new Error("We couldn't verify this payment. If money was debited, it will be confirmed automatically or refunded.");
    const { confirmOnlinePayment } = await import("@/lib/orders.server");
    return confirmOnlinePayment({ razorpayOrderId: data.razorpayOrderId, razorpayPaymentId: data.razorpayPaymentId, signatureVerified: true });
  });

export const reportPaymentFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ razorpayOrderId: rzpId("order"), razorpayPaymentId: rzpId("pay") }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: o } = await db.from("orders").select("id, user_id").eq("razorpay_order_id", data.razorpayOrderId).maybeSingle();
    if (!o || o.user_id !== context.userId) throw new Error("Order not found");
    const { recordFailedPayment } = await import("@/lib/orders.server");
    // Razorpay is asked directly; the browser's failure report is only a hint.
    const r = await recordFailedPayment(data);
    return { state: r.state };
  });

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const o = await ownOrder(context.userId, data.orderId);
    if (o.status !== "pending_payment") throw new Error("Only unpaid online orders can be cancelled here.");
    const db = await admin();
    const { count } = await db.from("payments").select("id", { count: "exact", head: true }).eq("order_id", o.id).eq("status", "captured");
    if (count) throw new Error("This order was already paid.");
    await db.rpc("hungry_release_order", { p_order: o.id });
    return { ok: true };
  });

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(3, "Tell us why").max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const o = await ownOrder(context.userId, data.orderId);
    if (!canRequestRefund(o)) throw new Error("Refunds can be requested for online-paid orders that haven't been collected.");
    const { createRefundRequest } = await import("@/lib/orders.server");
    await createRefundRequest({ order: o, amount: o.total, reason: data.reason, requestedBy: "customer" });
    return { ok: true };
  });

/* ---------------- Canteen owners ---------------- */
export const claimCanteen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: accessCodeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const email = String((context.claims as { email?: string }).email ?? "").toLowerCase();
    const db = await admin();
    const { data: c } = await db.from("canteens").select("id, contact_email, owner_user_id, is_active").eq("code", data.code).maybeSingle();
    if (!c || !c.is_active)
      throw new Error("This code isn't an approved canteen. Unapproved canteens must register first.");
    if (c.contact_email.toLowerCase() !== email)
      throw new Error("Sign in with the contact email used in your canteen application.");
    if (c.owner_user_id && c.owner_user_id !== context.userId) throw new Error("This canteen is already linked to another account.");
    if (!c.owner_user_id) await db.from("canteens").update({ owner_user_id: context.userId }).eq("id", c.id).is("owner_user_id", null);
    return { id: c.id };
  });

export const ownerUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), status: z.enum(["preparing", "ready", "collected", "cancelled"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const orders = await import("@/lib/orders.server");
    const o = await orders.getOrder(data.orderId);
    if (!o) throw new Error("Order not found");
    const { data: c } = await db.from("canteens").select("owner_user_id").eq("id", o.canteen_id).maybeSingle();
    if (!c || c.owner_user_id !== context.userId) throw new Error("Forbidden");
    if (!canOwnerMove(o.status, data.status)) throw new Error("That status change isn't allowed.");

    if (data.status === "cancelled") {
      if (o.payment_method === "razorpay" && o.payment_status === "paid") {
        const r = await orders.createRefundRequest({ order: o, amount: o.total, reason: "Cancelled by the canteen", requestedBy: "canteen" });
        await orders.startRefund(r.id);
        return { ok: true, refund: true };
      }
      await db.rpc("hungry_release_order", { p_order: o.id });
      return { ok: true, refund: false };
    }
    const patch: { status: string; payment_status?: string; paid_at?: string } = { status: data.status };
    if (data.status === "collected" && o.payment_method === "counter") {
      patch.payment_status = "paid";
      patch.paid_at = new Date().toISOString();
    }
    const { data: updated } = await db.from("orders").update(patch).eq("id", o.id).eq("status", o.status).select("id").maybeSingle();
    if (!updated) throw new Error("This order was just updated. Refresh and try again.");
    return { ok: true, refund: false };
  });
