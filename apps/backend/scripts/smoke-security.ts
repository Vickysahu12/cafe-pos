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
    const socket = io(BASE, { auth: { token: aChef }, transports: ["websocket"] });
    const gotEvent = new Promise<boolean>((resolve) => {
      socket.on("order:created", () => resolve(true));
      setTimeout(() => resolve(false), 8000);
    });
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    const pub = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", items: [{ productId: A.product.id, quantity: 1 }],
    });
    check("public order → 201", pub.status === 201, pub.json);
    check("public response hides outletId/cashierId", pub.json?.data && !("outletId" in pub.json.data) && !("cashierId" in pub.json.data), pub.json?.data);
    check("chef KDS socket received order:created", await gotEvent);
    socket.disconnect();

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
      orderType: "DINE_IN", tableId: A.table.id, items: [{ productId: A.product.id, quantity: 2 }],
    });
    check("public DINE_IN order with table → 201", dineIn.status === 201, dineIn.json);
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

    const crossProduct = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", items: [{ productId: B.product.id, quantity: 1 }],
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
      orderType: "TAKEAWAY", items: [{ productId: A.product.id, quantity: 1 }],
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
