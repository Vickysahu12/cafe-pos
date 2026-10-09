/**
 * SECURITY SMOKE TEST (2026-09-29)
 * ─────────────────────────────────────────────────────────
 * USE CASE: 29 Sept ke security fixes ko ek CHALTE server ke against verify
 * karta hai — do nakli cafes (A aur B) banata hai, har woh attack try karta hai
 * jo pehle possible tha, aur check karta hai ki ab block hota hai. End mein
 * apna banaya saara test data DELETE kar deta hai.
 *
 * ⚠️ Sirf DEV database pe chalao — production DB pe kabhi nahi.
 *
 * KAISE CHALAYE:
 *   1. pnpm turbo run build --filter=backend
 *   2. (apps/backend mein)  PORT=3998 node dist/server.js      ← alag terminal
 *   3. (apps/backend mein)  SMOKE_URL=http://localhost:3998 npx tsx scripts/smoke-security.ts
 *
 * CONNECTED TO: modules/orders, modules/menu, modules/public-menu, sockets/
 */

import { createRequire } from "module";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// socket.io-client backend ki dependency nahi hai — mobile app wala use karte hain
const requireFromMobile = createRequire(path.resolve(__dirname, "../../mobile/package.json"));
const { io } = requireFromMobile("socket.io-client") as typeof import("socket.io-client");

const BASE = process.env.SMOKE_URL ?? "http://localhost:3998";
const API = `${BASE}/api/v1`;
const TAG = `smoke${Date.now()}`;
const PASSWORD = "SmokeTest#12345";

const prisma = new PrismaClient();
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}`, detail ?? "");
  }
}

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function createTenant(label: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const org = await prisma.organization.create({ data: { name: `${TAG}-${label}` } });
  const outlet = await prisma.outlet.create({
    data: { name: `${TAG} ${label}`, slug: `${TAG}-${label}`.toLowerCase(), address: "Test address", phone: "9876543210", organizationId: org.id },
  });
  const mkUser = (role: "OWNER" | "CASHIER" | "CHEF") =>
    prisma.user.create({
      data: {
        name: `${label} ${role}`, email: `${TAG}-${label}-${role}@example.com`.toLowerCase(), phone: "9876543210",
        passwordHash, role, outletId: outlet.id, emailVerified: true,
      },
    });
  const [owner, cashier, chef] = [await mkUser("OWNER"), await mkUser("CASHIER"), await mkUser("CHEF")];
  const table = await prisma.table.create({ data: { tableNumber: "T1", capacity: 4, outletId: outlet.id } });
  const category = await prisma.category.create({ data: { name: "Drinks", outletId: outlet.id } });
  const product = await prisma.product.create({
    data: { name: "Coffee", price: 100, taxRate: 5, isVeg: true, categoryId: category.id, outletId: outlet.id },
  });
  return { org, outlet, owner, cashier, chef, table, category, product };
}

async function login(email: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data.accessToken as string;
}

async function main() {
  console.log(`Smoke test against ${BASE} (tag ${TAG})`);
  const A = await createTenant("A");
  const B = await createTenant("B");

  try {
    // ── Login (email case-insensitive) ───────────────────────────
    console.log("\nAuth");
    const upper = await call("POST", "/auth/login", undefined, { email: A.owner.email.toUpperCase(), password: PASSWORD });
    check("login works with UPPERCASE email", upper.status === 200, upper.json);
    const wrong = await call("POST", "/auth/login", undefined, { email: A.owner.email, password: "wrong-password" });
    check("wrong password → 401 INVALID_CREDENTIALS", wrong.status === 401 && wrong.json?.error?.code === "INVALID_CREDENTIALS", wrong.json);

    const aOwner = await login(A.owner.email);
    const aCashier = await login(A.cashier.email);
    const aChef = await login(A.chef.email);
    const bOwner = await login(B.owner.email);

    // ── Menu mass assignment ─────────────────────────────────────
    console.log("\nMenu — category update mass assignment");
    const mass = await call("PATCH", `/menu/categories/${A.category.id}`, aOwner, { name: "Hacked", outletId: B.outlet.id });
    check("PATCH category with outletId → 400", mass.status === 400, mass.json);
    const catAfter = await prisma.category.findUnique({ where: { id: A.category.id } });
    check("category still belongs to outlet A", catAfter?.outletId === A.outlet.id);
    const okCat = await call("PATCH", `/menu/categories/${A.category.id}`, aOwner, { name: "Beverages" });
    check("valid category rename → 200", okCat.status === 200 && okCat.json?.data?.name === "Beverages", okCat.json);

    // ── Orders ───────────────────────────────────────────────────
    console.log("\nOrders");
    const foreignTable = await call("POST", "/orders", aCashier, {
      orderType: "DINE_IN", tableId: B.table.id, items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("order with another outlet's tableId → 404", foreignTable.status === 404, foreignTable.json);

    const aOrder = await call("POST", "/orders", aCashier, {
      orderType: "DINE_IN", tableId: A.table.id, items: [{ productId: A.product.id, quantity: 3 }],
    });
    check("create order → 201", aOrder.status === 201, aOrder.json);
    check("cashier-billed order records the cashier", aOrder.json?.data?.cashierId === A.cashier.id, aOrder.json?.data?.cashierId);
    // (2026-10-09) Owner bhi "Bill" tab se bill karta hai — order pe owner ka id, null NAHI
    // (null = customer QR order ka nishaan → app/KDS pe galat "QR" badge aata)
    const ownerBilled = await call("POST", "/orders", aOwner, { orderType: "TAKEAWAY", items: [{ productId: A.product.id, quantity: 1 }] });
    check("owner-billed order → 201 with owner as biller (not QR)", ownerBilled.status === 201 && ownerBilled.json?.data?.cashierId === A.owner.id, ownerBilled.json?.data?.cashierId);
    const aOrderId = aOrder.json.data.id as string;
    check("totals rounded: 300 + 15 tax = 315", aOrder.json.data.netAmount === 315, aOrder.json.data);

    const bOrder = await call("POST", "/orders", bOwner, { orderType: "TAKEAWAY", items: [{ productId: B.product.id, quantity: 1 }] });
    const bItemId = bOrder.json.data.items[0].id as string;

    const crossItem = await call("PATCH", `/orders/${aOrderId}/items/${bItemId}/status`, aChef, { status: "READY" });
    check("chef A updating outlet B's item via own orderId → 404", crossItem.status === 404, crossItem.json);
    const bItemAfter = await prisma.orderItem.findUnique({ where: { id: bItemId } });
    check("outlet B item untouched (still PENDING)", bItemAfter?.status === "PENDING", bItemAfter?.status);

    const badItemStatus = await call("PATCH", `/orders/${aOrderId}/items/${aOrder.json.data.items[0].id}/status`, aChef, { status: "EXPLODED" });
    check("invalid item status → 400", badItemStatus.status === 400, badItemStatus.json);

    const cancelViaStatus = await call("PATCH", `/orders/${aOrderId}/status`, aCashier, { status: "CANCELLED" });
    check("cashier CANCELLED via /status → 400", cancelViaStatus.status === 400, cancelViaStatus.json);

    const badQuery = await call("GET", "/orders?orderStatus=bogus&dateFrom=kal", aCashier);
    check("bad list filters → 400 (not 500)", badQuery.status === 400, badQuery.json);

    // ── Payment / discount ───────────────────────────────────────
    console.log("\nPayment & discount");
    const hugeDiscount = await call("POST", `/orders/${aOrderId}/pay`, aCashier, { paymentMethod: "CASH", discountAmount: 9999 });
    check("discount > bill → 400", hugeDiscount.status === 400, hugeDiscount.json);
    const pay = await call("POST", `/orders/${aOrderId}/pay`, aCashier, { paymentMethod: "CASH", discountAmount: 15 });
    check("pay with ₹15 discount → 200, net 300", pay.status === 200 && pay.json?.data?.netAmount === 300, pay.json);
    const payAgain = await call("POST", `/orders/${aOrderId}/pay`, aCashier, { paymentMethod: "CASH", discountAmount: 200 });
    check("paying already-PAID order again → 409", payAgain.status === 409, payAgain.json);
    const discountLog = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "APPLY_DISCOUNT" } });
    check("APPLY_DISCOUNT audit log written", !!discountLog);

    // ── Void ─────────────────────────────────────────────────────
    console.log("\nVoid");
    const cashierVoid = await call("POST", `/orders/${aOrderId}/void`, aCashier, { reason: "customer left" });
    check("cashier cannot void → 403", cashierVoid.status === 403, cashierVoid.json);
    const voidRes = await call("POST", `/orders/${aOrderId}/void`, aOwner, { reason: "customer complaint" });
    check("owner void paid order → 200, REFUNDED", voidRes.status === 200 && voidRes.json?.data?.paymentStatus === "REFUNDED", voidRes.json);
    const voidAgain = await call("POST", `/orders/${aOrderId}/void`, aOwner, { reason: "second time" });
    check("void again → 409", voidAgain.status === 409, voidAgain.json);
    const revive = await call("PATCH", `/orders/${aOrderId}/status`, aCashier, { status: "SERVED" });
    check("reviving cancelled order via /status → 409", revive.status === 409, revive.json);
    const cancelLogs = await prisma.auditLog.count({ where: { outletId: A.outlet.id, action: "CANCEL_ORDER" } });
    check("exactly one CANCEL_ORDER audit log", cancelLogs === 1, cancelLogs);
    const tableAfter = await prisma.table.findUnique({ where: { id: A.table.id } });
    check("table freed after void", tableAfter?.status === "AVAILABLE", tableAfter?.status);

    // ── Public QR order → KDS socket ─────────────────────────────
    console.log("\nPublic QR order");
    // (2026-10-06) QR orders need customer contact: name always, phone for takeaway
    const noName = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerPhone: "9876543210", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("QR order without name → 400", noName.status === 400, noName.json);
    const noPhone = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Rahul", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("QR TAKEAWAY without phone → 400", noPhone.status === 400, noPhone.json);
    const badPhone = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Rahul", customerPhone: "12345", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("QR order with invalid phone → 400", badPhone.status === 400, badPhone.json);
    const badName = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "<script>alert(1)</script>", customerPhone: "9876543210", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("QR order with HTML in name → 400", badName.status === 400, badName.json);

    // Chef (KDS only) must get the order WITHOUT phone; Owner (in kds+pos rooms) gets it ONCE, WITH phone
    const socket = io(BASE, { auth: { token: aChef }, transports: ["websocket"] });
    const ownerSocket = io(BASE, { auth: { token: aOwner }, transports: ["websocket"] });
    const ownerEvents: any[] = [];
    ownerSocket.on("order:created", (p: any) => ownerEvents.push(p));
    // (2026-10-09) Counter phone (cashier) — QR order alert (QrOrderAlert.tsx) isi event pe bajta hai
    const cashierSocket = io(BASE, { auth: { token: aCashier }, transports: ["websocket"] });
    const cashierEvents: any[] = [];
    cashierSocket.on("order:created", (p: any) => cashierEvents.push(p));
    const gotEvent = new Promise<any>((resolve) => {
      socket.on("order:created", (p: any) => resolve(p));
      setTimeout(() => resolve(null), 8000);
    });
    await Promise.all(
      [socket, ownerSocket, cashierSocket].map(
        (sk) =>
          new Promise<void>((resolve, reject) => {
            sk.on("connect", () => resolve());
            sk.on("connect_error", reject);
          })
      )
    );
    const pub = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Rahul", customerPhone: "+91 98765-43210", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("public order (name + messy phone) → 201", pub.status === 201, pub.json);
    check("public response hides outletId/cashierId/phone", pub.json?.data && !("outletId" in pub.json.data) && !("cashierId" in pub.json.data) && !("customerPhone" in pub.json.data), pub.json?.data);
    const chefPayload = await gotEvent;
    check("chef KDS socket received order:created", !!chefPayload);
    check("chef KDS payload has the NAME but NOT the phone", chefPayload?.order?.customerName === "Rahul" && chefPayload?.order?.customerPhone == null, chefPayload?.order);
    await new Promise((r) => setTimeout(r, 800));
    check("owner (kds+pos rooms) gets order:created exactly ONCE", ownerEvents.length === 1, ownerEvents.length);
    check("owner payload includes normalised phone", ownerEvents[0]?.order?.customerPhone === "9876543210", ownerEvents[0]?.order);
    // (2026-10-09) QR alert ka contract: app SIRF `cashierId === null` pe chime bajata hai
    const qrEvt = cashierEvents.find((e) => e?.order?.id === pub.json?.data?.id);
    check(
      "counter phone (cashier) gets the QR order live, marked as QR (cashierId null) with #, name, amount",
      !!qrEvt && qrEvt.order.cashierId === null && typeof qrEvt.order.orderNumber === "number" && qrEvt.order.customerName === "Rahul" && typeof qrEvt.order.netAmount === "number" && "table" in qrEvt.order,
      qrEvt?.order
    );
    check("owner's QR order event is marked as QR too", ownerEvents[0]?.order?.cashierId === null, ownerEvents[0]?.order?.cashierId);
    const before = ownerEvents.length;
    const counterBill = await call("POST", "/orders", aCashier, { orderType: "TAKEAWAY", items: [{ productId: A.product.id, quantity: 1 }] });
    await new Promise((r) => setTimeout(r, 800));
    const counterEvt = ownerEvents.slice(before).find((e) => e?.order?.id === counterBill.json?.data?.id);
    check("counter bill event carries the cashier id (so it never rings as a QR order)", counterEvt?.order?.cashierId === A.cashier.id, counterEvt?.order?.cashierId);
    socket.disconnect();
    ownerSocket.disconnect();
    cashierSocket.disconnect();

    const pubId = pub.json?.data?.id;
    const asCashier = await call("GET", `/orders/${pubId}`, aCashier);
    check("cashier sees customer phone (to call)", asCashier.json?.data?.customerPhone === "9876543210" && asCashier.json?.data?.customerName === "Rahul", asCashier.json?.data);
    const asChef = await call("GET", `/orders/${pubId}`, aChef);
    check("chef GET order → name yes, phone NO", asChef.json?.data?.customerName === "Rahul" && asChef.json?.data?.customerPhone == null, asChef.json?.data);
    const chefList = await call("GET", `/orders`, aChef);
    check("chef order LIST never includes phones", (chefList.json?.data ?? []).every((o: any) => o.customerPhone == null), (chefList.json?.data ?? []).length);
    const pubStatus = await call("GET", `/public/${A.outlet.slug}/orders/${pubId}`);
    check("public status shows name, never phone", pubStatus.json?.data?.customerName === "Rahul" && !("customerPhone" in (pubStatus.json?.data ?? {})), pubStatus.json?.data);
    const pubBill = await call("GET", `/public/bills/${pubId}`);
    // (test cafe ka apna phone bhi 9876543210 hai — isliye field check, string search nahi)
    check("public bill never includes customer phone/name fields", pubBill.status === 200 && !("customerPhone" in (pubBill.json?.data ?? {})) && !("customerName" in (pubBill.json?.data ?? {})), Object.keys(pubBill.json?.data ?? {}));

    // Retention: phones older than 30 days are wiped (order itself stays)
    await prisma.order.update({ where: { id: pubId }, data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    const { purgeOldCustomerPhones } = await import("../src/modules/orders/customer-data-retention");
    const purged = await purgeOldCustomerPhones();
    const afterPurge = await prisma.order.findUnique({ where: { id: pubId } });
    check("retention: 31-day-old order loses phone, keeps name + order", purged >= 1 && afterPurge?.customerPhone === null && afterPurge?.customerName === "Rahul", { purged, phone: afterPurge?.customerPhone });

    const bigQty = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", items: [{ productId: A.product.id, quantity: 100000 }],
    });
    check("public order quantity 100000 → 400", bigQty.status === 400, bigQty.json);

    // (2026-09-30) Per-table QR + public status shape
    const tableMenu = await call("GET", `/public/${A.outlet.slug}/menu?table=${A.table.id}`);
    check("menu ?table=<id> returns that table", tableMenu.json?.data?.table?.tableNumber === "T1", tableMenu.json?.data?.table);
    const foreignTableMenu = await call("GET", `/public/${A.outlet.slug}/menu?table=${B.table.id}`);
    check("menu ?table=<other cafe's table> → table null", foreignTableMenu.json?.data?.table === null, foreignTableMenu.json?.data?.table);
    check("public menu hides internal fields (no outletId on products)", !("outletId" in (tableMenu.json?.data?.categories?.[0]?.products?.[0] ?? {})));
    const dineIn = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DINE_IN", tableId: A.table.id, customerName: "Priya", items: [{ productId: A.product.id, quantity: 2 }],
    });
    check("public DINE_IN order with table + name, NO phone → 201 (phone optional at a table)", dineIn.status === 201, dineIn.json);
    const dineStatus = await call("GET", `/public/${A.outlet.slug}/orders/${dineIn.json?.data?.id}`);
    check(
      "public status has table, per-item price and tax",
      dineStatus.json?.data?.table?.tableNumber === "T1" && typeof dineStatus.json?.data?.items?.[0]?.totalPrice === "number" && typeof dineStatus.json?.data?.taxAmount === "number",
      dineStatus.json?.data
    );
    check("public status has updatedAt (2026-10-02)", typeof dineStatus.json?.data?.updatedAt === "string", dineStatus.json?.data);

    // (2026-10-02) "Popular here" — sirf isi cafe ke, abhi available products ke ids
    const popular: unknown = tableMenu.json?.data?.popular;
    const menuIds = new Set(
      (tableMenu.json?.data?.categories ?? []).flatMap((c: any) => c.products.map((p: any) => p.id))
    );
    check(
      "public menu popular = array of this cafe's menu product ids (max 6)",
      Array.isArray(popular) && popular.length <= 6 && popular.every((id) => menuIds.has(id)),
      popular
    );
    check("popular never leaks another cafe's product", Array.isArray(popular) && !popular.includes(B.product.id), popular);

    // (2026-10-05) Digital bill (WhatsApp) — public, by unguessable order UUID, minimal fields
    const bill = await call("GET", `/public/bills/${dineIn.json?.data?.id}`);
    check(
      "public bill → 200 with café, items, unit prices, totals",
      bill.status === 200 && bill.json?.data?.outlet?.name && typeof bill.json?.data?.items?.[0]?.unitPrice === "number" && typeof bill.json?.data?.netAmount === "number",
      bill.json
    );
    const billKeys = JSON.stringify(bill.json?.data ?? {});
    check("public bill hides internal ids (outletId, cashierId, id)", !/"(outletId|cashierId|organizationId|id)":/.test(billKeys), Object.keys(bill.json?.data ?? {}));
    const noBill = await call("GET", `/public/bills/00000000-0000-4000-8000-000000000000`);
    check("unknown bill id → 404", noBill.status === 404, noBill.json);
    const badBill = await call("GET", `/public/bills/not-a-uuid`);
    check("non-UUID bill id → 404 (no DB lookup)", badBill.status === 404, badBill.json);

    // (2026-10-05) REVIEW BOOSTER — Google-only link, roles, tenant isolation, public endpoints
    const evilLink = await call("PUT", "/reviews/settings", aOwner, { googleReviewUrl: "https://evil-phish.com/review" });
    check("review link: non-Google URL → 400", evilLink.status === 400, evilLink.json);
    const goodLink = await call("PUT", "/reviews/settings", aOwner, { googleReviewUrl: "g.page/r/SmokeTest123/review" });
    check(
      "review link: g.page saved + normalised to https",
      goodLink.status === 200 && goodLink.json?.data?.googleReviewUrl === "https://g.page/r/SmokeTest123/review",
      goodLink.json
    );
    const linkAudit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "UPDATE_REVIEW_LINK" } });
    check("review link change writes an audit log", !!linkAudit);
    const cashierLink = await call("PUT", "/reviews/settings", aCashier, { googleReviewUrl: "https://g.page/r/x/review" });
    check("cashier cannot change review link → 403", cashierLink.status === 403, cashierLink.json);
    const cashierFeedback = await call("GET", "/reviews/feedback", aCashier);
    check("cashier cannot read private feedback → 403", cashierFeedback.status === 403, cashierFeedback.json);

    const reviewInfo = await call("GET", `/public/${A.outlet.slug}/review`);
    check(
      "public review page → name + link, no internal ids",
      reviewInfo.status === 200 && reviewInfo.json?.data?.googleReviewUrl === "https://g.page/r/SmokeTest123/review" && !("id" in (reviewInfo.json?.data ?? {})),
      reviewInfo.json
    );
    const fb = await call("POST", `/public/${A.outlet.slug}/feedback`, undefined, {
      message: "Coffee was cold today", name: "Smoke", source: "CARD",
    });
    check("public private feedback → 201", fb.status === 201, fb.json);
    const fbForeignOrder = await call("POST", `/public/${A.outlet.slug}/feedback`, undefined, {
      message: "Linked to other cafe order", source: "BILL", orderId: bOrder.json.data.id as string,
    });
    check("feedback with another café's orderId still accepted (201)", fbForeignOrder.status === 201, fbForeignOrder.json);
    const fbBad = await call("POST", `/public/${A.outlet.slug}/feedback`, undefined, { message: "x".repeat(501), source: "CARD" });
    check("feedback > 500 chars → 400", fbBad.status === 400, fbBad.json);
    const fbBadSource = await call("POST", `/public/${A.outlet.slug}/feedback`, undefined, { message: "hello", source: "STARS_5" });
    check("feedback with invalid source → 400", fbBadSource.status === 400, fbBadSource.json);

    await call("POST", `/public/${A.outlet.slug}/review-events`, undefined, { type: "CARD_VIEW" });
    await call("POST", `/public/${A.outlet.slug}/review-events`, undefined, { type: "GOOGLE_CLICK" });
    const badEvent = await call("POST", `/public/${A.outlet.slug}/review-events`, undefined, { type: "FAKE" });
    check("review event with invalid type → 400", badEvent.status === 400, badEvent.json);

    const summary = await call("GET", "/reviews/summary", aOwner);
    check(
      "review summary counts scans, Google taps, messages, unread",
      summary.status === 200 && summary.json.data.cardScans >= 1 && summary.json.data.googleTaps >= 1 && summary.json.data.privateMessages >= 2 && summary.json.data.unread >= 2,
      summary.json
    );
    const aList = await call("GET", "/reviews/feedback", aOwner);
    const foreignLinked = (aList.json?.data ?? []).find((f: any) => f.message === "Linked to other cafe order");
    check("another café's orderId is NOT stored on feedback", foreignLinked && foreignLinked.orderId === null, foreignLinked);
    const bList = await call("GET", "/reviews/feedback", bOwner);
    check(
      "café B cannot see café A's private feedback",
      bList.status === 200 && !(bList.json?.data ?? []).some((f: any) => f.message === "Coffee was cold today"),
      bList.json
    );
    await call("POST", "/reviews/feedback/read-all", aOwner);
    const afterRead = await call("GET", "/reviews/summary", aOwner);
    check("read-all clears unread badge", afterRead.json?.data?.unread === 0, afterRead.json);

    const billWithLink = await call("GET", `/public/bills/${dineIn.json?.data?.id}`);
    check("bill includes café's Google review link", billWithLink.json?.data?.outlet?.googleReviewUrl === "https://g.page/r/SmokeTest123/review", billWithLink.json?.data?.outlet);
    const statusWithLink = await call("GET", `/public/${A.outlet.slug}/orders/${dineIn.json?.data?.id}`);
    check("order status includes review link + café name", !!statusWithLink.json?.data?.outlet?.googleReviewUrl && !!statusWithLink.json?.data?.outlet?.name, statusWithLink.json?.data?.outlet);

    const crossProduct = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Smoke", customerPhone: "9876543210", items: [{ productId: B.product.id, quantity: 1 }],
    });
    check("public order with other cafe's product → 404", crossProduct.status === 404, crossProduct.json);

    // ── (2026-09-29) Menu edit/delete ────────────────────────────
    console.log("\nMenu edit/delete");
    const editForeign = await call("PATCH", `/menu/products/${B.product.id}`, aOwner, { price: 1 });
    check("edit another cafe's product → 404", editForeign.status === 404, editForeign.json);
    const cashierEdit = await call("PATCH", `/menu/products/${A.product.id}`, aCashier, { price: 1 });
    check("cashier cannot edit product → 403", cashierEdit.status === 403, cashierEdit.json);
    const edit = await call("PATCH", `/menu/products/${A.product.id}`, aOwner, {
      price: 120, variants: [{ name: "Large", price: 150 }],
    });
    check("owner edits price + variants → 200", edit.status === 200 && edit.json?.data?.price === 120 && edit.json?.data?.variants?.length === 1, edit.json);
    const priceLog = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "PRICE_CHANGE" } });
    check("PRICE_CHANGE audit log written", !!priceLog);
    const catNotEmpty = await call("DELETE", `/menu/categories/${A.category.id}`, aOwner);
    check("delete non-empty category → 409", catNotEmpty.status === 409, catNotEmpty.json);
    const delProduct = await call("DELETE", `/menu/products/${A.product.id}`, aOwner);
    check("delete product that has orders → 200", delProduct.status === 200, delProduct.json);
    const archived = await prisma.product.findUnique({ where: { id: A.product.id } });
    check("…it is archived (old bills keep working), not hard-deleted", !!archived?.archivedAt);
    const orderArchived = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Smoke", customerPhone: "9876543210", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("archived product cannot be ordered → 404", orderArchived.status === 404, orderArchived.json);
    const oldOrder = await call("GET", `/orders/${aOrderId}`, aOwner);
    check("old order with archived product still loads", oldOrder.status === 200 && oldOrder.json?.data?.items?.[0]?.product?.name === "Coffee", oldOrder.json);
    const delCat = await call("DELETE", `/menu/categories/${A.category.id}`, aOwner);
    check("delete now-empty category → 200", delCat.status === 200, delCat.json);
    const cats = await call("GET", "/menu/categories", aOwner);
    check("deleted category hidden from list", cats.status === 200 && cats.json.data.every((c: any) => c.id !== A.category.id), cats.json);

    // ── (2026-09-30) Sales report ───────────────────────────────
    console.log("\nSales report");
    const report = await call("GET", "/analytics/sales-report?days=7", aOwner);
    const daily = await call("GET", "/analytics/daily-summary", aOwner);
    check("sales report 7d → 200 with 7 day points", report.status === 200 && report.json?.data?.series?.length === 7, report.json);
    check(
      "report revenue & orders match today's daily summary (all test orders are today)",
      report.json?.data?.totals?.revenue === daily.json?.data?.totalSales && report.json?.data?.totals?.orders === daily.json?.data?.totalOrders,
      { report: report.json?.data?.totals, daily: { sales: daily.json?.data?.totalSales, orders: daily.json?.data?.totalOrders } }
    );
    check("report has top items", Array.isArray(report.json?.data?.topItems) && report.json.data.topItems.length > 0, report.json?.data?.topItems);
    const report30 = await call("GET", "/analytics/sales-report?days=30", aOwner);
    check("sales report 30d → 30 points", report30.json?.data?.series?.length === 30, report30.status);
    const badDays = await call("GET", "/analytics/sales-report?days=9999", aOwner);
    check("sales report days=9999 → 400", badDays.status === 400, badDays.json);
    const cashierReport = await call("GET", "/analytics/sales-report?days=7", aCashier);
    check("cashier cannot see sales report → 403", cashierReport.status === 403, cashierReport.json);
    const otherOwner = await call("GET", "/analytics/sales-report?days=7", bOwner);
    check("owner B's report doesn't include outlet A's sales", otherOwner.json?.data?.totals?.orders !== report.json?.data?.totals?.orders || otherOwner.json?.data?.totals?.revenue === 0, otherOwner.json?.data?.totals);

    // ── (2026-10-09) Reports batch 1: insights + CSV export ─────
    // Is waqt outlet A mein: cashier ka order (₹15 discount, PAID) jo owner ne void kiya
    // (→ REFUNDED, reason "customer complaint"), owner ka unpaid takeaway, QR orders (Rahul…),
    // aur "Coffee" archived hai (slow movers mein nahi aana chahiye).
    console.log("\nReports — insights + export");
    const ins = await call("GET", "/analytics/insights?period=today", aOwner);
    const insD = ins.json?.data;
    check("insights today → 200", ins.status === 200 && !!insD, ins.json);
    check(
      "insights KPIs match daily summary (same definitions everywhere)",
      insD?.kpis?.revenue === daily.json?.data?.totalSales && insD?.kpis?.orders === daily.json?.data?.totalOrders,
      { kpis: insD?.kpis, daily: daily.json?.data }
    );
    check("refunded (paid then voided) order counted once", insD?.leakage?.refunded?.count === 1 && insD?.leakage?.cancelled?.count === 1, insD?.leakage);
    check(
      "cancellation shows reason + who voided it",
      insD?.leakage?.recentCancellations?.[0]?.reason === "customer complaint" && insD?.leakage?.recentCancellations?.[0]?.by === A.owner.name && insD?.leakage?.recentCancellations?.[0]?.wasPaid === true,
      insD?.leakage?.recentCancellations
    );
    check("discount shows amount + who gave it", insD?.leakage?.recentDiscounts?.[0]?.amount === 15 && insD?.leakage?.recentDiscounts?.[0]?.by === A.cashier.name, insD?.leakage?.recentDiscounts);
    const stCashier = (insD?.staff ?? []).find((x: any) => x.userId === A.cashier.id);
    const stOwner = (insD?.staff ?? []).find((x: any) => x.userId === A.owner.id);
    check("staff: cashier has 1 discount + 1 bill later voided", stCashier?.discountsGiven === 1 && stCashier?.billsVoided === 1, stCashier);
    check("staff: owner did 1 void and billed 1 order", stOwner?.cancelsDone === 1 && stOwner?.orders >= 1, stOwner);
    check("QR orders counted as their own channel", insD?.channels?.qr?.orders >= 1, insD?.channels);
    check("unpaid bills surfaced", insD?.leakage?.unpaid?.count >= 1, insD?.leakage?.unpaid);
    check("heatmap is 7 days × 24 hours", insD?.heatmap?.avgOrders?.length === 7 && insD.heatmap.avgOrders.every((r: number[]) => r.length === 24), insD?.heatmap);
    check("archived item never shows as a slow mover", (insD?.items?.slow ?? []).every((x: any) => x.productId !== A.product.id), insD?.items?.slow);
    check("today has a closing summary that is live", insD?.closing?.isLive === true && typeof insD?.closing?.collected === "number", insD?.closing);
    const ins7 = await call("GET", "/analytics/insights?period=7d", aOwner);
    check("insights 7d → 7 day points, no closing", ins7.json?.data?.series?.length === 7 && ins7.json?.data?.closing === null, ins7.json?.data?.series?.length);
    const insY = await call("GET", "/analytics/insights?period=yesterday", aOwner);
    check("yesterday → 0 orders, closing not live", insY.json?.data?.kpis?.orders === 0 && insY.json?.data?.closing?.isLive === false, insY.json?.data?.kpis);
    const ins30 = await call("GET", "/analytics/insights?period=30d", aOwner);
    check("insights 30d → 30 day points", ins30.json?.data?.series?.length === 30, ins30.status);
    const insBad = await call("GET", "/analytics/insights?period=365d", aOwner);
    check("insights period=365d → 400", insBad.status === 400, insBad.json);
    const insCashier = await call("GET", "/analytics/insights?period=today", aCashier);
    check("cashier cannot see insights → 403", insCashier.status === 403, insCashier.json);
    const insB = await call("GET", "/analytics/insights?period=today", bOwner);
    // B ka apna ek takeaway order hai (upar bOrder) — A ka kuch bhi nahi dikhna chahiye
    const bOwnOrders = await prisma.order.count({ where: { outletId: B.outlet.id, orderStatus: { not: "CANCELLED" } } });
    check(
      "owner B sees only B's own orders, never A's staff",
      insB.json?.data?.kpis?.orders === bOwnOrders && (insB.json?.data?.staff ?? []).every((x: any) => ![A.owner.id, A.cashier.id, A.chef.id].includes(x.userId)),
      { kpis: insB.json?.data?.kpis, bOwnOrders, staff: insB.json?.data?.staff }
    );
    const cmp = await call("GET", "/analytics/today-compare", aOwner);
    check("today-compare matches insights", cmp.status === 200 && cmp.json?.data?.today?.orders === insD?.kpis?.orders && cmp.json?.data?.today?.revenue === insD?.kpis?.revenue, cmp.json);

    const csvRes = await fetch(`${API}/analytics/export?period=today&type=orders`, { headers: { authorization: `Bearer ${aOwner}` } });
    const csv = await csvRes.text();
    check("export orders → 200 text/csv attachment", csvRes.status === 200 && (csvRes.headers.get("content-type") ?? "").startsWith("text/csv") && (csvRes.headers.get("content-disposition") ?? "").includes(".csv"), csvRes.headers.get("content-type"));
    // (Rahul wala order retention test ne 31 din peeche kar diya — aaj ka QR order "Priya" hai)
    check("export has header + QR order with customer name + refunded order", csv.includes("Order #") && /,QR,Dine-in,T1,Priya,/.test(csv) && csv.includes("Refunded"), csv.slice(0, 600));
    check("export NEVER contains customer phone", !csv.includes("9876543210"));
    const csvItems = await fetch(`${API}/analytics/export?period=7d&type=items`, { headers: { authorization: `Bearer ${aOwner}` } });
    check("export items → 200 with item rows", csvItems.status === 200 && (await csvItems.text()).includes("Coffee"), csvItems.status);
    const csvBad = await fetch(`${API}/analytics/export?period=today&type=customers`, { headers: { authorization: `Bearer ${aOwner}` } });
    check("export type=customers → 400", csvBad.status === 400, csvBad.status);
    const csvCashier = await fetch(`${API}/analytics/export?period=today`, { headers: { authorization: `Bearer ${aCashier}` } });
    check("cashier cannot export → 403", csvCashier.status === 403, csvCashier.status);

    // ── (2026-09-29) Password reset / change ─────────────────────
    console.log("\nPassword reset");
    const forgotUnknown = await call("POST", "/auth/forgot-password", undefined, { email: `nobody-${TAG}@example.com` });
    const forgotKnown = await call("POST", "/auth/forgot-password", undefined, { email: A.cashier.email });
    check(
      "forgot-password: same response for unknown and known email (no enumeration)",
      forgotUnknown.status === 200 && forgotKnown.status === 200 && forgotUnknown.json?.message === forgotKnown.json?.message,
      [forgotUnknown.json, forgotKnown.json]
    );
    // Email padh nahi sakte — ek known OTP seedha DB mein daalte hain (hashed, jaise app karta hai)
    await prisma.emailVerification.create({
      data: {
        userId: A.cashier.id, purpose: "PASSWORD_RESET", otpHash: await bcrypt.hash("123456", 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const wrongOtp = await call("POST", "/auth/reset-password", undefined, { email: A.cashier.email, otp: "000000", newPassword: "NewPass#9999" });
    check("reset with wrong OTP → 400", wrongOtp.status === 400, wrongOtp.json);
    const reset = await call("POST", "/auth/reset-password", undefined, { email: A.cashier.email, otp: "123456", newPassword: "NewPass#9999" });
    check("reset with correct OTP → 200", reset.status === 200, reset.json);
    const oldPass = await call("POST", "/auth/login", undefined, { email: A.cashier.email, password: PASSWORD });
    check("old password no longer works", oldPass.status === 401, oldPass.json);
    const newPass = await call("POST", "/auth/login", undefined, { email: A.cashier.email, password: "NewPass#9999" });
    check("new password works", newPass.status === 200, newPass.json);
    const verifyWithReset = await call("POST", "/auth/verify-email", undefined, { userId: A.cashier.id, otp: "123456" });
    check("reset OTP can't be reused for email-verify", verifyWithReset.status === 400, verifyWithReset.json);

    const chefResetsCashier = await call("POST", `/auth/staff/${A.cashier.id}/reset-password`, aChef, { newPassword: "Hacked#12345" });
    check("chef cannot reset staff password → 403", chefResetsCashier.status === 403, chefResetsCashier.json);
    const ownerResetsForeign = await call("POST", `/auth/staff/${B.cashier.id}/reset-password`, aOwner, { newPassword: "Hacked#12345" });
    check("owner A cannot reset outlet B's staff → 404", ownerResetsForeign.status === 404, ownerResetsForeign.json);
    const ownerResets = await call("POST", `/auth/staff/${A.chef.id}/reset-password`, aOwner, { newPassword: "ChefNew#12345" });
    check("owner resets own chef's password → 200", ownerResets.status === 200, ownerResets.json);

    const changeWrong = await call("POST", "/auth/change-password", aOwner, { currentPassword: "nope", newPassword: "Owner#New12345" });
    check("change-password with wrong current → 400", changeWrong.status === 400, changeWrong.json);
    const change = await call("POST", "/auth/change-password", aOwner, { currentPassword: PASSWORD, newPassword: "Owner#New12345" });
    check("change-password → 200 with fresh tokens", change.status === 200 && !!change.json?.data?.refreshToken, change.json);

    // ── (2026-09-30) Staff consent (DPDP) ────────────────────────
    console.log("\nStaff consent");
    const chefLogin = await call("POST", "/auth/login", undefined, { email: A.chef.email, password: "ChefNew#12345" });
    check("staff login shows consentAcceptedAt = null", chefLogin.status === 200 && chefLogin.json?.data?.user?.consentAcceptedAt === null, chefLogin.json?.data?.user);
    const chefToken = chefLogin.json?.data?.accessToken as string;
    const consent = await call("POST", "/auth/consent", chefToken);
    check("POST /auth/consent → 200", consent.status === 200 && !!consent.json?.data?.consentAcceptedAt, consent.json);
    const me = await call("GET", "/auth/me", chefToken);
    check("/auth/me now has consentAcceptedAt", !!me.json?.data?.consentAcceptedAt, me.json);
    const consentLogs = await prisma.auditLog.count({ where: { userId: A.chef.id, action: "CONSENT_ACCEPTED" } });
    await call("POST", "/auth/consent", chefToken); // dobara — idempotent hona chahiye
    const consentLogs2 = await prisma.auditLog.count({ where: { userId: A.chef.id, action: "CONSENT_ACCEPTED" } });
    check("consent is recorded once (idempotent)", consentLogs === 1 && consentLogs2 === 1, { consentLogs, consentLogs2 });

    // ── (2026-09-29) Account deletion ────────────────────────────
    console.log("\nAccount deletion");
    const managerDelete = await call("DELETE", "/auth/account", aCashier, { password: PASSWORD, confirmText: "DELETE" });
    check("non-owner cannot delete account → 403 (or 401 after reset)", [401, 403].includes(managerDelete.status), managerDelete.json);
    const noConfirm = await call("DELETE", "/auth/account", bOwner, { password: PASSWORD, confirmText: "delete" });
    check("delete without typing DELETE → 400", noConfirm.status === 400, noConfirm.json);
    const wrongPw = await call("DELETE", "/auth/account", bOwner, { password: "wrong", confirmText: "DELETE" });
    check("delete with wrong password → 400", wrongPw.status === 400, wrongPw.json);
    const del = await call("DELETE", "/auth/account", bOwner, { password: PASSWORD, confirmText: "DELETE" });
    check("owner B deletes account → 200", del.status === 200, del.json);
    const bLeft = await prisma.organization.findUnique({ where: { id: B.org.id } });
    const bUsers = await prisma.user.count({ where: { outletId: B.outlet.id } });
    const bOrders = await prisma.order.count({ where: { outletId: B.outlet.id } });
    check("outlet B org, users, orders all gone", !bLeft && bUsers === 0 && bOrders === 0, { bLeft, bUsers, bOrders });
    const bLogin = await call("POST", "/auth/login", undefined, { email: B.owner.email, password: PASSWORD });
    check("deleted owner can't log in", bLogin.status === 401, bLogin.json);
    const aStillThere = await prisma.organization.findUnique({ where: { id: A.org.id } });
    check("outlet A untouched by B's deletion", !!aStillThere);
  } finally {
    // ── Cleanup: sirf is run ka data ─────────────────────────────
    const outletIds = [A.outlet.id, B.outlet.id];
    await prisma.auditLog.deleteMany({ where: { outletId: { in: outletIds } } });
    await prisma.orderItem.deleteMany({ where: { order: { outletId: { in: outletIds } } } });
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id] } } });
    await prisma.$disconnect();
    console.log("\nCleanup done.");
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
