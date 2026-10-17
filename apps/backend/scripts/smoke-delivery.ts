/**
 * DELIVERY LINK SMOKE TEST (2026-10-18)
 * ─────────────────────────────────────────────────────────
 * USE CASE: WhatsApp delivery link ke har edge case ko CHALTE server ke against check karta hai —
 * dispatch rules, link security (purana link band, guess, expiry), paise (full / kam / counter pe
 * pehle pay / bill badla), cancel, cross-cafe, roles, delivery cash settle. Do nakli cafes banata
 * hai aur end mein saara test data DELETE kar deta hai.
 *
 * ⚠️ Sirf DEV database pe chalao — production DB pe kabhi nahi.
 *
 * KAISE CHALAYE (smoke-security.ts jaisa hi):
 *   1. pnpm turbo run build --filter=backend
 *   2. (apps/backend mein)  PORT=3998 node dist/server.js      ← alag terminal
 *   3. (apps/backend mein)  SMOKE_URL=http://localhost:3998 npx tsx scripts/smoke-delivery.ts
 *
 * CONNECTED TO: modules/delivery, modules/orders, modules/public-menu
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3998";
const API = `${BASE}/api/v1`;
const TAG = `smokedl${Date.now()}`;
const PASSWORD = "SmokeTest#12345";

const prisma = new PrismaClient();
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function createTenant(label: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const org = await prisma.organization.create({ data: { name: `${TAG}-${label}` } });
  const outlet = await prisma.outlet.create({
    data: {
      name: `${TAG} ${label}`,
      slug: `${TAG}-${label}`.toLowerCase(),
      address: "Test address",
      phone: "9876543210",
      organizationId: org.id,
      deliveryEnabled: true,
      deliveryCharge: 30,
    },
  });
  const mk = (role: "OWNER" | "CASHIER" | "CHEF") =>
    prisma.user.create({
      data: {
        name: `${label} ${role}`,
        email: `${TAG}-${label}-${role}@example.com`.toLowerCase(),
        phone: "9876543210",
        passwordHash,
        role,
        outletId: outlet.id,
        emailVerified: true,
        consentAcceptedAt: new Date(),
      },
    });
  const [owner, cashier, chef] = [await mk("OWNER"), await mk("CASHIER"), await mk("CHEF")];
  const category = await prisma.category.create({ data: { name: "Food", outletId: outlet.id } });
  const product = await prisma.product.create({
    data: { name: "Burger", price: 100, taxRate: 0, isVeg: true, categoryId: category.id, outletId: outlet.id },
  });
  return { org, outlet, owner, cashier, chef, product };
}

async function login(email: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data.accessToken as string;
}

/** Customer website se delivery order (asli flow) → ₹100 + ₹30 delivery = ₹130 */
async function webDeliveryOrder(slug: string, productId: string) {
  const r = await call("POST", `/public/${slug}/orders`, undefined, {
    orderType: "DELIVERY",
    items: [{ productId, quantity: 1 }],
    customerName: "Priya",
    customerPhone: "9812345678",
    deliveryAddress: "B-204 Green Park, Vesu, Surat",
    deliveryLocation: { lat: 21.14, lng: 72.77 },
  });
  if (r.status !== 201) throw new Error(`web order failed: ${JSON.stringify(r.json)}`);
  return r.json.data.id as string;
}

const ready = (id: string, token: string) => call("PATCH", `/orders/${id}/status`, token, { status: "READY" });

async function main() {
  console.log(`Delivery smoke test against ${BASE} (tag ${TAG})`);
  const A = await createTenant("A");
  const B = await createTenant("B");

  try {
    const aOwner = await login(A.owner.email);
    const aCashier = await login(A.cashier.email);
    const aChef = await login(A.chef.email);
    const bOwner = await login(B.owner.email);

    // ── Delivery people ──
    console.log("\nDelivery people");
    const bad = await call("POST", "/delivery/people", aCashier, { name: "Raju", phone: "12345" });
    check("invalid phone → 400", bad.status === 400, bad.json);
    const raju = await call("POST", "/delivery/people", aCashier, { name: "Raju", phone: "+91 98765 11111" });
    check("cashier adds Raju → 201, phone normalised", raju.status === 201 && raju.json?.data?.phone === "9876511111", raju.json);
    const rajuId = raju.json?.data?.id as string;
    const again = await call("POST", "/delivery/people", aCashier, { name: "Raju Bhai", phone: "9876511111" });
    check("same number again → same person (no duplicate), name updated", again.json?.data?.id === rajuId && again.json?.data?.name === "Raju Bhai", again.json);
    const amit = await call("POST", "/delivery/people", aOwner, { name: "Amit", phone: "9876522222" });
    const amitId = amit.json?.data?.id as string;
    const chefList = await call("GET", "/delivery/people", aChef);
    check("chef can't see delivery people → 403", chefList.status === 403, chefList.status);
    const bPerson = await call("POST", "/delivery/people", bOwner, { name: "B Rider", phone: "9876533333" });
    const bPersonId = bPerson.json?.data?.id as string;

    // ── Dispatch rules ──
    console.log("\nDispatch rules");
    const o1 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    const notReady = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: rajuId });
    check("dispatch before food is ready → 409 NOT_READY", notReady.status === 409 && notReady.json?.error?.code === "NOT_READY", notReady.json);
    await ready(o1, aCashier);
    const chefDispatch = await call("POST", `/delivery/orders/${o1}/dispatch`, aChef, { deliveryPersonId: rajuId });
    check("chef can't dispatch → 403", chefDispatch.status === 403, chefDispatch.status);
    const crossOrder = await call("POST", `/delivery/orders/${o1}/dispatch`, bOwner, { deliveryPersonId: bPersonId });
    check("café B dispatching café A's order → 404", crossOrder.status === 404, crossOrder.json);
    const crossPerson = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: bPersonId });
    check("café A using café B's delivery person → 404", crossPerson.status === 404, crossPerson.json);
    const both = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: rajuId, self: true });
    check("person + self together → 400", both.status === 400, both.json);

    const d1 = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: rajuId });
    const tok1 = d1.json?.data?.token as string;
    check("dispatch → 200 with link token + Raju's phone", d1.status === 200 && typeof tok1 === "string" && d1.json?.data?.personPhone === "9876511111", d1.json);
    check("order is Out for delivery · Raju Bhai", d1.json?.data?.order?.deliveryStatus === "OUT_FOR_DELIVERY" && d1.json?.data?.order?.deliveryPersonName === "Raju Bhai", d1.json?.data?.order);
    const row1 = await prisma.order.findUnique({ where: { id: o1 } });
    check("DB stores only the HASH, never the raw token", !!row1?.deliveryLinkHash && row1.deliveryLinkHash !== tok1 && row1.deliveryLinkHash === crypto.createHash("sha256").update(tok1).digest("hex"));
    check("link expires in ~12 h", !!row1?.deliveryLinkExpiresAt && Math.abs(row1.deliveryLinkExpiresAt.getTime() - Date.now() - 12 * 3600e3) < 120e3);

    // ── Rider view ──
    console.log("\nRider link");
    const v1 = await call("GET", `/rider/${tok1}`);
    check("rider sees OUT, ₹130 to collect, customer phone + address + pin", v1.status === 200 && v1.json?.data?.state === "OUT" && v1.json?.data?.amountDue === 130 && v1.json?.data?.customerPhone === "9812345678" && !!v1.json?.data?.address && v1.json?.data?.lat === 21.14, v1.json);
    check("no UPI QR when café hasn't verified UPI", v1.json?.data?.upi === null, v1.json?.data?.upi);
    check("rider view doesn't leak internal ids", !("id" in (v1.json?.data ?? {})) && !("outletId" in (v1.json?.data ?? {})), Object.keys(v1.json?.data ?? {}));
    const garbage = await call("GET", `/rider/${crypto.randomBytes(16).toString("base64url")}`);
    check("random (guessed) token → 404", garbage.status === 404, garbage.json);
    const junk = await call("GET", `/rider/abc'%20OR%201=1`);
    check("malformed token → 404", junk.status === 404, junk.status);

    // UPI on → QR data in rider view
    await prisma.outlet.update({ where: { id: A.outlet.id }, data: { upiId: "testcafe@okaxis", upiName: "Test Cafe", upiVerifiedAt: new Date() } });
    const vUpi = await call("GET", `/rider/${tok1}`);
    check("café UPI verified → rider view has UPI for door QR", vUpi.json?.data?.upi?.id === "testcafe@okaxis", vUpi.json?.data?.upi);

    // ── Reassign kills the old link ──
    console.log("\nReassign");
    const d2 = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: amitId });
    const tok2 = d2.json?.data?.token as string;
    check("change person → new token", d2.status === 200 && tok2 && tok2 !== tok1, d2.json);
    const oldView = await call("GET", `/rider/${tok1}`);
    check("old link (Raju) → 404 immediately", oldView.status === 404, oldView.json);
    const oldDeliver = await call("POST", `/rider/${tok1}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "CASH" });
    check("old link can't mark delivered → 404", oldDeliver.status === 404, oldDeliver.json);

    // ── Issue ──
    const issue = await call("POST", `/rider/${tok2}/issue`, undefined, { type: "CUSTOMER_UNAVAILABLE" });
    check("customer not available → café sees issue", issue.status === 200 && issue.json?.data?.issue === "CUSTOMER_UNAVAILABLE", issue.json);
    const orderAfterIssue = await call("GET", `/orders/${o1}`, aOwner);
    check("order still out for delivery, issue visible to café", orderAfterIssue.json?.data?.deliveryStatus === "OUT_FOR_DELIVERY" && orderAfterIssue.json?.data?.deliveryIssue === "CUSTOMER_UNAVAILABLE", orderAfterIssue.json?.data);

    // ── Money validation ──
    console.log("\nMoney");
    const wrongDue = await call("POST", `/rider/${tok2}/delivered`, undefined, { expectedDue: 100, collected: 100, method: "CASH" });
    check("rider saw a different amount → 409 AMOUNT_CHANGED", wrongDue.status === 409 && wrongDue.json?.error?.code === "AMOUNT_CHANGED", wrongDue.json);
    const over = await call("POST", `/rider/${tok2}/delivered`, undefined, { expectedDue: 130, collected: 200, method: "CASH" });
    check("collected more than bill → 400", over.status === 400, over.json);
    const noMethod = await call("POST", `/rider/${tok2}/delivered`, undefined, { expectedDue: 130, collected: 130 });
    check("collected without Cash/UPI → 400", noMethod.status === 400, noMethod.json);

    const [ok, dup] = await Promise.all([
      call("POST", `/rider/${tok2}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "CASH" }),
      call("POST", `/rider/${tok2}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "CASH" }),
    ]);
    check("two taps at once → both 200 (one real update)", ok.status === 200 && dup.status === 200, [ok.json, dup.json]);
    const done1 = await prisma.order.findUnique({ where: { id: o1 } });
    check("order DELIVERED + SERVED + PAID by CASH, ₹130 collected, issue cleared", done1?.deliveryStatus === "DELIVERED" && done1?.orderStatus === "SERVED" && done1?.paymentStatus === "PAID" && done1?.paymentMethod === "CASH" && done1?.deliveryCollected === 130 && done1?.deliveryIssue === null, done1);
    const afterView = await call("GET", `/rider/${tok2}`);
    check("after delivery the link hides customer phone/address", afterView.json?.data?.state === "DELIVERED" && !("customerPhone" in afterView.json.data) && !("address" in afterView.json.data), afterView.json?.data);
    const redispatch = await call("POST", `/delivery/orders/${o1}/dispatch`, aCashier, { deliveryPersonId: rajuId });
    check("dispatch after delivered → 409", redispatch.status === 409, redispatch.json);

    // ── Short payment ──
    const o2 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o2, aCashier);
    const t2 = (await call("POST", `/delivery/orders/${o2}/dispatch`, aCashier, { deliveryPersonId: rajuId })).json?.data?.token as string;
    const short = await call("POST", `/rider/${t2}/delivered`, undefined, { expectedDue: 130, collected: 100, method: "CASH" });
    const s2 = await prisma.order.findUnique({ where: { id: o2 } });
    check("collected less → delivered but UNPAID + SHORT_PAYMENT, ₹100 recorded", short.status === 200 && s2?.deliveryStatus === "DELIVERED" && s2?.paymentStatus === "UNPAID" && s2?.deliveryIssue === "SHORT_PAYMENT" && s2?.deliveryCollected === 100, s2);

    // ── Paid at the counter while out ──
    const o3 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o3, aCashier);
    const t3 = (await call("POST", `/delivery/orders/${o3}/dispatch`, aCashier, { deliveryPersonId: rajuId })).json?.data?.token as string;
    await call("POST", `/orders/${o3}/pay`, aCashier, { paymentMethod: "UPI" });
    const stale = await call("POST", `/rider/${t3}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "CASH" });
    check("paid at counter meanwhile → rider's old amount rejected (409)", stale.status === 409 && stale.json?.error?.code === "AMOUNT_CHANGED", stale.json);
    const v3 = await call("GET", `/rider/${t3}`);
    check("refreshed link shows ₹0 to collect, no UPI QR", v3.json?.data?.amountDue === 0 && v3.json?.data?.upi === null, v3.json?.data);
    const paidDeliver = await call("POST", `/rider/${t3}/delivered`, undefined, { expectedDue: 0, collected: 0 });
    const s3 = await prisma.order.findUnique({ where: { id: o3 } });
    check("already-paid order delivered, payment untouched (UPI), nothing collected", paidDeliver.status === 200 && s3?.paymentMethod === "UPI" && s3?.deliveryCollected === 0 && s3?.deliveryStatus === "DELIVERED", s3);

    // ── Delivery charge changed while out ──
    const o4 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o4, aCashier);
    const t4 = (await call("POST", `/delivery/orders/${o4}/dispatch`, aCashier, { deliveryPersonId: rajuId })).json?.data?.token as string;
    await call("PATCH", `/orders/${o4}/delivery`, aOwner, { deliveryCharge: 0 });
    const changed = await call("POST", `/rider/${t4}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "UPI" });
    check("café changed the charge meanwhile → 409, nothing recorded", changed.status === 409 && changed.json?.error?.code === "AMOUNT_CHANGED", changed.json);

    // ── Cancelled while out ──
    console.log("\nCancel / expiry / self");
    const voided = await call("POST", `/orders/${o4}/void`, aOwner, { reason: "Customer cancelled on phone" });
    check("owner cancels order while out → 200", voided.status === 200, voided.json);
    const cView = await call("GET", `/rider/${t4}`);
    check("rider link shows CANCELLED (bring food back), no customer data", cView.json?.data?.state === "CANCELLED" && !("customerPhone" in (cView.json?.data ?? {})), cView.json?.data);
    const cDeliver = await call("POST", `/rider/${t4}/delivered`, undefined, { expectedDue: 100, collected: 100, method: "CASH" });
    check("can't deliver a cancelled order → 409", cDeliver.status === 409, cDeliver.json);

    // ── Expired ──
    const o5 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o5, aCashier);
    const t5 = (await call("POST", `/delivery/orders/${o5}/dispatch`, aCashier, { deliveryPersonId: rajuId })).json?.data?.token as string;
    await prisma.order.update({ where: { id: o5 }, data: { deliveryLinkExpiresAt: new Date(Date.now() - 1000) } });
    const eView = await call("GET", `/rider/${t5}`);
    check("expired link → EXPIRED view", eView.json?.data?.state === "EXPIRED", eView.json?.data);
    const eDeliver = await call("POST", `/rider/${t5}/delivered`, undefined, { expectedDue: 130, collected: 130, method: "CASH" });
    check("expired link can't deliver → 410", eDeliver.status === 410, eDeliver.json);
    const manual = await call("PATCH", `/orders/${o5}/delivery`, aCashier, { deliveryStatus: "DELIVERED" });
    check("café can still mark it delivered from the counter", manual.status === 200 && manual.json?.data?.deliveryStatus === "DELIVERED", manual.json);

    // ── Self ──
    const o6 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o6, aOwner);
    const self = await call("POST", `/delivery/orders/${o6}/dispatch`, aOwner, { self: true });
    check("'I'll deliver myself' → no link, owner's name", self.status === 200 && self.json?.data?.token === null && self.json?.data?.order?.deliveryPersonName === "A OWNER", self.json?.data);

    // ── Archive ──
    const removedByCashier = await call("DELETE", `/delivery/people/${amitId}`, aCashier);
    check("cashier can't remove a delivery person → 403", removedByCashier.status === 403, removedByCashier.status);
    const removed = await call("DELETE", `/delivery/people/${amitId}`, aOwner);
    const list = await call("GET", `/delivery/people`, aCashier);
    check("owner removes Amit → gone from list", removed.status === 200 && !list.json?.data?.some((p: any) => p.id === amitId), list.json);
    const o7 = await webDeliveryOrder(A.outlet.slug, A.product.id);
    await ready(o7, aCashier);
    const archived = await call("POST", `/delivery/orders/${o7}/dispatch`, aCashier, { deliveryPersonId: amitId });
    check("can't dispatch to a removed person → 404", archived.status === 404, archived.json);

    // ── Delivery cash ──
    console.log("\nDelivery cash");
    const cashierCash = await call("GET", "/delivery/cash", aCashier);
    check("cashier can't see delivery cash → 403", cashierCash.status === 403, cashierCash.status);
    const cash = await call("GET", "/delivery/cash", aOwner);
    const rajuCash = cash.json?.data?.find((g: any) => g.deliveryPersonId === rajuId);
    // o2 short ₹100 cash (Raju). o1 ₹130 cash was delivered by AMIT (reassigned)
    check("Raju holds ₹100 cash (1 order)", rajuCash?.cash === 100 && rajuCash?.count === 1, cash.json?.data);
    const amitCash = cash.json?.data?.find((g: any) => g.deliveryPersonId === amitId);
    check("Amit holds ₹130 cash (removed people still show — cash is real)", amitCash?.cash === 130, cash.json?.data);
    const bSettle = await call("POST", "/delivery/cash/settle", bOwner, { deliveryPersonId: rajuId, orderIds: rajuCash?.orderIds ?? [] });
    check("café B can't settle café A's cash → 409, nothing changed", bSettle.status === 409, bSettle.json);
    const settle = await call("POST", "/delivery/cash/settle", aOwner, { deliveryPersonId: rajuId, orderIds: rajuCash?.orderIds ?? [] });
    check("owner: got ₹100 from Raju → 200", settle.status === 200 && settle.json?.data?.amount === 100, settle.json);
    const settleAgain = await call("POST", "/delivery/cash/settle", aOwner, { deliveryPersonId: rajuId, orderIds: rajuCash?.orderIds ?? [] });
    check("settle twice → 409 (no double count)", settleAgain.status === 409, settleAgain.json);
    const audit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "DELIVERY_CASH_RECEIVED" } });
    check("audit log written for cash received", !!audit, audit);
    const cashAfter = await call("GET", "/delivery/cash", aOwner);
    check("Raju no longer listed, Amit still is", !cashAfter.json?.data?.some((g: any) => g.deliveryPersonId === rajuId) && cashAfter.json?.data?.some((g: any) => g.deliveryPersonId === amitId), cashAfter.json?.data);
  } finally {
    const outletIds = [A.outlet.id, B.outlet.id];
    await prisma.auditLog.deleteMany({ where: { outletId: { in: outletIds } } });
    await prisma.orderItem.deleteMany({ where: { order: { outletId: { in: outletIds } } } });
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id] } } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll delivery checks passed ✅" : `\n${failures} check(s) FAILED ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
