/**
 * DELIVERY SERVICE — WhatsApp delivery link
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-18)
 *
 * USE CASE: Cashier counter pe rehta hai, delivery boy deliver karta hai. Delivery boy ke paas
 * BillRaw app/login nahi — sirf WhatsApp. Flow:
 *   1. Cashier "Send to delivery person" → saved person chuno (ya "I'll deliver myself")
 *   2. Server ek random link token banata hai (sirf HASH DB mein), order OUT_FOR_DELIVERY
 *   3. App WhatsApp kholta hai: address, Maps pin, customer phone, kitna lena hai, link
 *   4. Delivery boy darwaze pe link kholta hai → "Delivered · ₹230 Cash/UPI" (ya "customer not
 *      available" / "kam paise mile") → cafe ke phone pe turant update
 *   5. Day-end: Owner dekhta hai kis delivery boy ke paas kitna cash hai → "Got ₹1,450"
 *
 * BHAROSA (paise ka mamla) — har rule server pe:
 *  - Link 128-bit random, DB mein sirf sha256 → guess/leak se link nahi banta
 *  - Ek link = ek order. Naya bheja / person badla → naya hash, purana link TURANT band
 *  - 12 ghante baad expire. Cancel hua → link "cancelled, wapas lao" dikhata hai
 *  - Delivered ek hi baar (conditional updateMany) — do baar tap / do phone = ek hi entry
 *  - Delivery boy ne jo amount dekha (expectedDue) server ke amount se alag → 409 (beech mein
 *    charge badla ya counter pe pay ho gaya) — galat amount kabhi record nahi hota
 *  - Kam paise mile → order DELIVERED par UNPAID rehta hai + ⚠️ "₹200 of ₹230" (Owner decide kare)
 *  - Link pe sirf delivery ke kaam ka data; delivered/cancel ke baad customer ka phone/address nahi
 *
 * CONNECTED TO: delivery.controller.ts, delivery.routes.ts (staff), rider.routes.ts (public link),
 *               orders.service.ts (ORDER shape), apps/web/app/d/[token], mobile orders/[id].tsx
 */

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { round2 } from "../../utils/money";
import { logAuditAction } from "../../middleware/audit-logger";
import type { DeliveryPersonInput, DispatchOrderInput, RiderDeliveredInput } from "@cafe-pos/shared-schemas";

export const DELIVERY_LINK_HOURS = 12;
const MAX_DELIVERY_PEOPLE = 30;

// orders.service.ts ke ORDER_INCLUDE jaisa hi — app ko order ka wahi shape mile
const ORDER_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
  table: true,
} as const;

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Token format check — galat/lamba string DB tak jaaye hi nahi */
function assertTokenShape(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    httpError("This link isn't valid. Ask the café to send it again.", 404, "LINK_INVALID");
  }
}

// ─────────────────────────────────────────────────────────
// Delivery people (cafe ki list)
// ─────────────────────────────────────────────────────────

export async function listDeliveryPeople(outletId: string) {
  return prisma.deliveryPerson.findMany({
    where: { outletId, archivedAt: null },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });
}

/** Same number dobara → naam update + wapas active (duplicate nahi banta) */
export async function addDeliveryPerson(outletId: string, input: DeliveryPersonInput) {
  const existing = await prisma.deliveryPerson.findUnique({
    where: { outletId_phone: { outletId, phone: input.phone } },
  });
  if (!existing || existing.archivedAt) {
    const active = await prisma.deliveryPerson.count({ where: { outletId, archivedAt: null } });
    if (active >= MAX_DELIVERY_PEOPLE) {
      httpError(`You can save up to ${MAX_DELIVERY_PEOPLE} delivery people. Remove someone first.`, 409, "TOO_MANY");
    }
  }
  return prisma.deliveryPerson.upsert({
    where: { outletId_phone: { outletId, phone: input.phone } },
    create: { outletId, name: input.name, phone: input.phone },
    update: { name: input.name, archivedAt: null },
    select: { id: true, name: true, phone: true },
  });
}

/** Archive — jo link abhi bahar hai woh chalta rahe (order beech mein na atke) */
export async function removeDeliveryPerson(outletId: string, id: string) {
  const person = await prisma.deliveryPerson.findFirst({ where: { id, outletId, archivedAt: null } });
  if (!person) httpError("Delivery person not found", 404, "NOT_FOUND");
  await prisma.deliveryPerson.update({ where: { id }, data: { archivedAt: new Date() } });
}

// ─────────────────────────────────────────────────────────
// Dispatch (cafe ka phone)
// ─────────────────────────────────────────────────────────

/**
 * Order kise diya. Person → naya link token (raw sirf is response mein, DB mein hash).
 * Dobara call (resend / person badla) → naya token, purana link band, purana issue saaf.
 * Self → koi link nahi, cafe ka banda khud "Mark delivered" dabata hai (Solo).
 */
export async function dispatchOrder(orderId: string, outletId: string, userId: string, input: DispatchOrderInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, outletId } });
    if (!order) httpError("Order not found in this outlet", 404, "NOT_FOUND");
    if (order.orderType !== "DELIVERY") httpError("This is not a delivery order", 400, "NOT_DELIVERY");
    if (order.orderStatus === "CANCELLED") httpError("This order has been cancelled", 409, "ORDER_CANCELLED");
    if (order.deliveryStatus === "DELIVERED") httpError("This order is already delivered", 409, "ALREADY_DELIVERED");
    if (order.orderStatus !== "READY") {
      httpError("Mark the food ready first, then send it for delivery.", 409, "NOT_READY");
    }

    let token: string | null = null;
    let personId: string | null = null;
    let personName: string;
    let personPhone: string | null = null;

    if (input.self) {
      const me = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
      personName = me?.name ?? "Café";
    } else {
      const person = await tx.deliveryPerson.findFirst({
        where: { id: input.deliveryPersonId!, outletId, archivedAt: null },
      });
      if (!person) httpError("That delivery person was removed. Pick someone else.", 404, "PERSON_NOT_FOUND");
      token = crypto.randomBytes(16).toString("base64url"); // 128-bit, 22 chars
      personId = person.id;
      personName = person.name;
      personPhone = person.phone;
    }

    const now = new Date();
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        outletId,
        orderStatus: "READY",
        deliveryStatus: { in: ["PLACED", "OUT_FOR_DELIVERY"] },
      },
      data: {
        deliveryStatus: "OUT_FOR_DELIVERY",
        deliveryPersonId: personId,
        deliveryPersonName: personName,
        deliveryLinkHash: token ? hashToken(token) : null,
        deliveryLinkExpiresAt: token ? new Date(now.getTime() + DELIVERY_LINK_HOURS * 3600 * 1000) : null,
        deliverySentAt: now,
        deliveryIssue: null,
        deliveryIssueAt: null,
      },
    });
    if (count === 0) httpError("This order was just updated on another device. Please refresh.", 409, "ORDER_CONFLICT");

    const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    return { order: updated, token, personPhone };
  });
}

// ─────────────────────────────────────────────────────────
// Delivery cash (Owner/Manager)
// ─────────────────────────────────────────────────────────

/** Kis delivery boy ke paas kitna cash hai (jo abhi Owner ko nahi diya) */
export async function getDeliveryCash(outletId: string) {
  const rows = await prisma.order.findMany({
    where: {
      outletId,
      deliveryPersonId: { not: null },
      deliveryCollectedMethod: "CASH",
      deliveryCollected: { gt: 0 },
      deliveryCashSettledAt: null,
      orderStatus: { not: "CANCELLED" },
    },
    select: { id: true, deliveryPersonId: true, deliveryPersonName: true, deliveryCollected: true },
    orderBy: { deliveredAt: "asc" },
    take: 500,
  });
  const byPerson = new Map<string, { deliveryPersonId: string; name: string; cash: number; count: number; orderIds: string[] }>();
  for (const r of rows) {
    const key = r.deliveryPersonId!;
    const g = byPerson.get(key) ?? { deliveryPersonId: key, name: r.deliveryPersonName ?? "Delivery", cash: 0, count: 0, orderIds: [] };
    g.cash = round2(g.cash + (r.deliveryCollected ?? 0));
    g.count += 1;
    g.orderIds.push(r.id);
    g.name = r.deliveryPersonName ?? g.name; // latest naam
    byPerson.set(key, g);
  }
  return [...byPerson.values()].sort((a, b) => b.cash - a.cash);
}

/** Sirf wahi orders settle jo Owner ne screen pe dekhe (beech mein naya delivery aaya to woh baaki rahe) */
export async function settleDeliveryCash(outletId: string, userId: string, input: { deliveryPersonId: string; orderIds: string[] }) {
  return prisma.$transaction(async (tx) => {
    const where: Prisma.OrderWhereInput = {
      id: { in: input.orderIds },
      outletId,
      deliveryPersonId: input.deliveryPersonId,
      deliveryCollectedMethod: "CASH",
      deliveryCashSettledAt: null,
    };
    const rows = await tx.order.findMany({ where, select: { deliveryCollected: true, deliveryPersonName: true } });
    if (rows.length === 0) httpError("This cash was already marked as received.", 409, "ALREADY_SETTLED");
    const amount = round2(rows.reduce((s, r) => s + (r.deliveryCollected ?? 0), 0));
    const { count } = await tx.order.updateMany({ where, data: { deliveryCashSettledAt: new Date() } });
    await logAuditAction(
      {
        userId,
        outletId,
        action: "DELIVERY_CASH_RECEIVED",
        metadata: { deliveryPersonId: input.deliveryPersonId, name: rows[0].deliveryPersonName, amount, orders: count },
      },
      tx
    );
    return { amount, orders: count };
  });
}

// ─────────────────────────────────────────────────────────
// Rider link (PUBLIC — bina login)
// ─────────────────────────────────────────────────────────

const RIDER_SELECT = {
  id: true,
  outletId: true,
  orderNumber: true,
  orderType: true,
  orderStatus: true,
  paymentStatus: true,
  netAmount: true,
  customerName: true,
  customerPhone: true,
  deliveryAddress: true,
  deliveryLat: true,
  deliveryLng: true,
  deliveryStatus: true,
  deliveryPersonName: true,
  deliveryLinkExpiresAt: true,
  deliveryIssue: true,
  deliveredAt: true,
  deliveryCollected: true,
  deliveryCollectedMethod: true,
  outlet: { select: { name: true, phone: true, upiId: true, upiName: true, upiVerifiedAt: true } },
} as const;

type RiderOrder = Prisma.OrderGetPayload<{ select: typeof RIDER_SELECT }>;

async function findByToken(token: string) {
  assertTokenShape(token);
  const order = await prisma.order.findUnique({ where: { deliveryLinkHash: hashToken(token) }, select: RIDER_SELECT });
  // Nahi mila = galat link YA cafe ne naya link bhej diya / person badal diya (purana hash gaya)
  if (!order) httpError("This link isn't valid anymore. Ask the café to send it again.", 404, "LINK_INVALID");
  return order;
}

const amountDue = (o: RiderOrder) => (o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED" ? 0 : round2(o.netAmount));

/** Delivery boy ko kya dikhe. Kaam khatam (delivered/cancel) → customer ka phone/address nahi bhejte. */
function riderView(o: RiderOrder) {
  const base = {
    orderNumber: o.orderNumber,
    outletName: o.outlet.name,
    outletPhone: o.outlet.phone,
    deliveryPersonName: o.deliveryPersonName,
  };
  if (o.orderStatus === "CANCELLED") return { ...base, state: "CANCELLED" as const };
  if (o.deliveryStatus === "DELIVERED") {
    return {
      ...base,
      state: "DELIVERED" as const,
      deliveredAt: o.deliveredAt,
      collected: o.deliveryCollected,
      collectedMethod: o.deliveryCollectedMethod,
    };
  }
  if (o.deliveryLinkExpiresAt && o.deliveryLinkExpiresAt < new Date()) return { ...base, state: "EXPIRED" as const };
  const due = amountDue(o);
  return {
    ...base,
    state: "OUT" as const,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    address: o.deliveryAddress,
    lat: o.deliveryLat,
    lng: o.deliveryLng,
    amountDue: due,
    issue: o.deliveryIssue,
    // Cafe ne UPI verify kiya ho tabhi — darwaze pe customer scan kare, paisa seedha cafe ko
    upi: due > 0 && o.outlet.upiId && o.outlet.upiVerifiedAt ? { id: o.outlet.upiId, name: o.outlet.upiName ?? o.outlet.name } : null,
  };
}

export async function getRiderView(token: string) {
  return riderView(await findByToken(token));
}

/**
 * Delivered. Pura amount → order PAID (method Cash/UPI). Kam → DELIVERED + UNPAID + ⚠️ SHORT_PAYMENT.
 * Pehle se paid (counter pe / complimentary) → kuch collect nahi, sirf delivered.
 * Returns { view, order, outletId } — controller socket emit kare.
 */
export async function riderMarkDelivered(token: string, input: RiderDeliveredInput) {
  const o = await findByToken(token);
  if (o.orderStatus === "CANCELLED") {
    httpError("This order was cancelled. Please take the food back to the café.", 409, "ORDER_CANCELLED");
  }
  if (o.deliveryStatus === "DELIVERED") return { view: riderView(o), order: null, outletId: o.outletId }; // dobara tap — same result
  if (o.deliveryLinkExpiresAt && o.deliveryLinkExpiresAt < new Date()) {
    httpError("This link has expired. Ask the café to mark it delivered.", 410, "LINK_EXPIRED");
  }
  if (o.deliveryStatus !== "OUT_FOR_DELIVERY") httpError("This order isn't out for delivery.", 409, "NOT_OUT");

  const due = amountDue(o);
  if (round2(input.expectedDue) !== due) {
    httpError(
      due === 0
        ? "This order was just marked paid at the café. Please check again."
        : `The bill changed to ₹${due}. Please check the amount and confirm again.`,
      409,
      "AMOUNT_CHANGED"
    );
  }
  const collected = due === 0 ? 0 : round2(input.collected);
  if (collected > due) httpError(`You can't collect more than the bill (₹${due}).`, 400, "OVER_COLLECTED");
  if (collected > 0 && !input.method) httpError("Choose Cash or UPI", 400, "METHOD_REQUIRED");
  const full = collected === due;

  const now = new Date();
  const hash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: {
        id: o.id,
        deliveryLinkHash: hash, // beech mein naya link bheja gaya → yeh purana link kuch nahi kar sakta
        deliveryStatus: "OUT_FOR_DELIVERY",
        orderStatus: { not: "CANCELLED" },
        paymentStatus: o.paymentStatus, // counter pe beech mein pay hua → ruk jao
      },
      data: {
        deliveryStatus: "DELIVERED",
        orderStatus: "SERVED", // delivered = served (orders list se hat-ta hai, jaise cafe ka "Mark delivered")
        deliveredAt: now,
        deliveryCollected: collected,
        deliveryCollectedMethod: collected > 0 ? input.method : null,
        deliveryIssue: full ? null : "SHORT_PAYMENT",
        deliveryIssueAt: full ? null : now,
        ...(due > 0 && full ? { paymentStatus: "PAID" as const, paymentMethod: input.method } : {}),
      },
    });
    if (count === 0) {
      // Do tap ek saath (ya slow net pe dobara tap) — pehle wale ne deliver kar diya → wahi "Delivered ✅"
      // dikhao, delivery boy ko darane wala error nahi. Paisa ek hi baar record hua hai.
      const now2 = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: RIDER_SELECT });
      if (now2.deliveryStatus === "DELIVERED" && now2.orderStatus !== "CANCELLED") {
        return { view: riderView(now2), order: null, outletId: o.outletId };
      }
      httpError("This order was just updated at the café. Please refresh the page.", 409, "ORDER_CONFLICT");
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: o.id }, include: ORDER_INCLUDE });
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: RIDER_SELECT });
    return { view: riderView(fresh), order, outletId: o.outletId };
  });
}

/** "Customer not available" — cafe ke phone pe ⚠️, order bahar hi rehta hai */
export async function riderReportIssue(token: string) {
  const o = await findByToken(token);
  if (o.orderStatus === "CANCELLED") httpError("This order was cancelled.", 409, "ORDER_CANCELLED");
  if (o.deliveryStatus !== "OUT_FOR_DELIVERY") httpError("This order isn't out for delivery.", 409, "NOT_OUT");
  if (o.deliveryLinkExpiresAt && o.deliveryLinkExpiresAt < new Date()) {
    httpError("This link has expired. Please call the café.", 410, "LINK_EXPIRED");
  }
  const { count } = await prisma.order.updateMany({
    where: { id: o.id, deliveryLinkHash: hashToken(token), deliveryStatus: "OUT_FOR_DELIVERY" },
    data: { deliveryIssue: "CUSTOMER_UNAVAILABLE", deliveryIssueAt: new Date() },
  });
  if (count === 0) httpError("This order was just updated at the café. Please refresh the page.", 409, "ORDER_CONFLICT");
  const order = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: ORDER_INCLUDE });
  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, select: RIDER_SELECT });
  return { view: riderView(fresh), order, outletId: o.outletId };
}
