// Email content for every HUNGRY notification. Pure functions: all dynamic values are HTML-escaped.

export const ADMIN_ALERT_EMAIL = "hungryofficialx@gmail.com";

export type EmailKind =
  | "welcome"
  | "order_confirmation"
  | "payment_failed"
  | "admin_payment_failed"
  | "refund_requested"
  | "admin_refund_requested"
  | "refund_processing"
  | "refund_processed"
  | "refund_rejected"
  | "admin_refund_update"
  | "canteen_approved"
  | "canteen_rejected";

export type EmailContent = { subject: string; text: string; html: string };

export const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const wrap = (title: string, body: string) =>
  `<div style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#111;max-width:560px"><p style="letter-spacing:6px;font-weight:900;margin:0 0 16px">HUNGRY</p><h2 style="color:#d1121b;margin:0 0 12px">${title}</h2>${body}<p style="margin-top:24px;color:#555">— Team HUNGRY</p></div>`;

const rupee = (n: number) => `₹${n}`;

export type OrderEmailData = {
  customerName: string;
  orderNumber: string;
  canteenName: string;
  lines: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  orderType: string;
  paymentMethod: string;
  pickupCode: string;
  counter: string;
  prepMinutes: number;
};

function linesHtml(lines: OrderEmailData["lines"]) {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines
    .map((l) => `<tr><td style="padding:4px 0">${esc(l.qty)}× ${esc(l.name)}</td><td style="text-align:right">${esc(rupee(l.price * l.qty))}</td></tr>`)
    .join("")}</table>`;
}

export function welcomeEmail(d: { name: string }): EmailContent {
  const first = d.name.split(" ")[0] ?? d.name;
  return {
    subject: "Welcome to HUNGRY 🍽️",
    text: `Hi ${first},\n\nYour HUNGRY account is ready. Log in, enter your campus canteen code and order ahead — skip the queue and pay ₹0 platform fee.\n\n— Team HUNGRY`,
    html: wrap(`Welcome, ${esc(first)}!`, `<p>Your HUNGRY account is ready.</p><ol><li>Log in to HUNGRY.</li><li>Enter your campus canteen's 7-character code.</li><li>Order ahead, skip the queue, pick up with your code.</li></ol><p>₹0 platform fee on every order.</p>`),
  };
}

export function orderConfirmationEmail(d: OrderEmailData): EmailContent {
  const paid = d.paymentMethod === "razorpay" ? "Paid online" : "Pay at the counter on pickup";
  const type = d.orderType === "parcel" ? "Parcel" : "Dine-in";
  return {
    subject: `Order ${d.orderNumber} confirmed — pickup code ${d.pickupCode}`,
    text: `Hi ${d.customerName},\n\nYour order ${d.orderNumber} at ${d.canteenName} is confirmed.\n\n${d.lines.map((l) => `${l.qty}x ${l.name} — ₹${l.price * l.qty}`).join("\n")}\n\nSubtotal: ₹${d.subtotal}\nDiscount: ₹${d.discount}\nTotal: ₹${d.total}\nType: ${type}\nPayment: ${paid}\n\nPickup code: ${d.pickupCode} at ${d.counter} (about ${d.prepMinutes} min).\n\n— Team HUNGRY`,
    html: wrap(
      `Order ${esc(d.orderNumber)} confirmed`,
      `<p>Hi ${esc(d.customerName)}, your order at <b>${esc(d.canteenName)}</b> is confirmed.</p>${linesHtml(d.lines)}<p>Subtotal: ${esc(rupee(d.subtotal))}${d.discount ? `<br/>Discount: −${esc(rupee(d.discount))}` : ""}<br/><b>Total: ${esc(rupee(d.total))}</b></p><p>${esc(type)} · ${esc(paid)}</p><p>Pickup code:</p><p style="font-size:28px;letter-spacing:8px;font-family:monospace;background:#111;color:#fff;padding:14px 20px;border-radius:12px;display:inline-block">${esc(d.pickupCode)}</p><p>${esc(d.counter)} · ready in about ${esc(d.prepMinutes)} min.</p>`,
    ),
  };
}

export function paymentFailedEmail(d: { customerName: string; orderNumber: string; total: number; reason: string }): EmailContent {
  return {
    subject: `Payment failed for order ${d.orderNumber}`,
    text: `Hi ${d.customerName},\n\nYour payment of ₹${d.total} for order ${d.orderNumber} didn't go through (${d.reason}). No money was taken for this attempt. You can retry from the Orders tab in HUNGRY, or cancel the order.\n\nIf money was debited, it will be returned automatically by your bank or reach out to us by replying to this email.\n\n— Team HUNGRY`,
    html: wrap(
      "Payment didn't go through",
      `<p>Hi ${esc(d.customerName)}, your payment of <b>${esc(rupee(d.total))}</b> for order <b>${esc(d.orderNumber)}</b> failed.</p><p>Reason: ${esc(d.reason)}</p><p>You can retry from the <b>Orders</b> tab, or cancel the order. If money was debited, it will be returned automatically — or reply to this email.</p>`,
    ),
  };
}

export function adminPaymentFailedEmail(d: { orderNumber: string; canteenName: string; customerEmail: string; total: number; paymentId: string; reason: string }): EmailContent {
  return {
    subject: `[HUNGRY alert] Payment failed — ${d.orderNumber}`,
    text: `Payment failed.\nOrder: ${d.orderNumber}\nCanteen: ${d.canteenName}\nCustomer: ${d.customerEmail}\nAmount: ₹${d.total}\nRazorpay payment: ${d.paymentId}\nReason: ${d.reason}`,
    html: wrap(
      "Payment failed",
      `<p>Order: <b>${esc(d.orderNumber)}</b><br/>Canteen: ${esc(d.canteenName)}<br/>Customer: ${esc(d.customerEmail)}<br/>Amount: ${esc(rupee(d.total))}<br/>Razorpay payment: ${esc(d.paymentId)}<br/>Reason: ${esc(d.reason)}</p>`,
    ),
  };
}

type RefundData = { customerName: string; orderNumber: string; amount: number; reason?: string; note?: string };

export function refundRequestedEmail(d: RefundData): EmailContent {
  return {
    subject: `Refund request received — ${d.orderNumber}`,
    text: `Hi ${d.customerName},\n\nWe've received your refund request of ₹${d.amount} for order ${d.orderNumber}. Our team will review it shortly and email you once it's processed.\n\n— Team HUNGRY`,
    html: wrap("Refund request received", `<p>Hi ${esc(d.customerName)}, we've received your refund request of <b>${esc(rupee(d.amount))}</b> for order <b>${esc(d.orderNumber)}</b>.</p><p>We'll email you as soon as it's processed.</p>`),
  };
}

export function refundProcessingEmail(d: RefundData): EmailContent {
  return {
    subject: `Your refund for ${d.orderNumber} is being processed`,
    text: `Hi ${d.customerName},\n\nYour refund of ₹${d.amount} for order ${d.orderNumber} has been initiated. It usually reaches your original payment method within 5–7 working days.\n\n— Team HUNGRY`,
    html: wrap("Refund initiated", `<p>Hi ${esc(d.customerName)}, your refund of <b>${esc(rupee(d.amount))}</b> for order <b>${esc(d.orderNumber)}</b> has been initiated.</p><p>It usually reaches your original payment method within 5–7 working days.</p>`),
  };
}

export function refundProcessedEmail(d: RefundData): EmailContent {
  return {
    subject: `Refund completed — ${d.orderNumber}`,
    text: `Hi ${d.customerName},\n\nYour refund of ₹${d.amount} for order ${d.orderNumber} has been processed to your original payment method.\n\n— Team HUNGRY`,
    html: wrap("Refund completed", `<p>Hi ${esc(d.customerName)}, your refund of <b>${esc(rupee(d.amount))}</b> for order <b>${esc(d.orderNumber)}</b> has been processed to your original payment method.</p>`),
  };
}

export function refundRejectedEmail(d: RefundData): EmailContent {
  return {
    subject: `Update on your refund request — ${d.orderNumber}`,
    text: `Hi ${d.customerName},\n\nAfter review, we couldn't approve the refund for order ${d.orderNumber}.${d.note ? `\nNote: ${d.note}` : ""}\n\nReply to this email if you have questions.\n\n— Team HUNGRY`,
    html: wrap("Refund request update", `<p>Hi ${esc(d.customerName)}, after review we couldn't approve the refund for order <b>${esc(d.orderNumber)}</b>.</p>${d.note ? `<p>Note: ${esc(d.note)}</p>` : ""}<p>Reply to this email if you have questions.</p>`),
  };
}

export function adminRefundEmail(d: { stage: string; orderNumber: string; canteenName: string; customerEmail: string; amount: number; reason?: string; refundId?: string }): EmailContent {
  return {
    subject: `[HUNGRY alert] Refund ${d.stage} — ${d.orderNumber}`,
    text: `Refund ${d.stage}.\nOrder: ${d.orderNumber}\nCanteen: ${d.canteenName}\nCustomer: ${d.customerEmail}\nAmount: ₹${d.amount}${d.reason ? `\nReason: ${d.reason}` : ""}${d.refundId ? `\nRazorpay refund: ${d.refundId}` : ""}`,
    html: wrap(
      `Refund ${esc(d.stage)}`,
      `<p>Order: <b>${esc(d.orderNumber)}</b><br/>Canteen: ${esc(d.canteenName)}<br/>Customer: ${esc(d.customerEmail)}<br/>Amount: ${esc(rupee(d.amount))}${d.reason ? `<br/>Reason: ${esc(d.reason)}` : ""}${d.refundId ? `<br/>Razorpay refund: ${esc(d.refundId)}` : ""}</p>`,
    ),
  };
}

export function canteenDecisionEmail(kind: "approved" | "rejected", d: { canteenName: string; university: string; code?: string; ownerLoginId?: string; ownerLoginCode?: string }): EmailContent {
  const name = esc(d.canteenName);
  const uni = esc(d.university);
  if (kind === "approved") {
    const code = esc(d.code ?? "");
    const ownerLoginId = esc(d.ownerLoginId ?? "");
    const ownerLoginCode = esc(d.ownerLoginCode ?? "");
    return {
      subject: `Your HUNGRY canteen is approved — owner login credentials inside`,
      text: `Great news! ${d.canteenName} (${d.university}) has been approved on HUNGRY.\n\nCanteen Owner ID (7 characters): ${d.ownerLoginId}\nUse this ID to identify your owner account at Canteen Owner Login.\n\nCanteen Owner Password Code (7 characters): ${d.ownerLoginCode}\nThis is your separate secret code for signing in to your owner dashboard. Keep it private. No account signup, password creation, or email verification is required.\n\nStudent/Faculty/Guest Canteen Code (7 characters): ${d.code}\nStudents, faculty, and guests enter this shared code in their HUNGRY account to join your canteen. It cannot access the owner dashboard.\n\n— Team HUNGRY`,
      html: wrap(
        "You're approved on HUNGRY!",
        `<p><b>${name}</b> (${uni}) has been verified.</p><p><b>Canteen Owner ID (7 characters)</b></p><p style="font-size:22px;letter-spacing:3px;font-family:monospace;background:#111;color:#fff;padding:14px 20px;border-radius:12px;display:inline-block">${ownerLoginId}</p><p>Use this ID to identify your owner account at Canteen Owner Login.</p><p><b>Canteen Owner Password Code (7 characters)</b></p><p style="font-size:28px;letter-spacing:8px;font-family:monospace;background:#111;color:#fff;padding:14px 20px;border-radius:12px;display:inline-block">${ownerLoginCode}</p><p>This is your separate secret code for signing in to your owner dashboard. Keep it private. No account signup, password creation, or email verification is required.</p><hr style="border-color:#333;margin:24px 0"/><p><b>Student/Faculty/Guest Canteen Code (7 characters)</b></p><p style="font-size:24px;letter-spacing:7px;font-family:monospace;background:#111;color:#fff;padding:12px 18px;border-radius:12px;display:inline-block">${code}</p><p>Students, faculty, and guests enter this shared code in their HUNGRY account to join your canteen. It cannot access the owner dashboard.</p>`,
      ),
    };
  }
  return {
    subject: `Update on your HUNGRY canteen application`,
    text: `Thank you for applying to HUNGRY with ${d.canteenName} (${d.university}).\n\nAfter review, we're unable to approve your application at this time. You're welcome to re-apply with updated details.\n\n— Team HUNGRY`,
    html: wrap("Application update", `<p>Thank you for applying to HUNGRY with <b>${name}</b> (${uni}).</p><p>After review, we're unable to approve your application at this time. You're welcome to re-apply with updated details.</p>`),
  };
}
