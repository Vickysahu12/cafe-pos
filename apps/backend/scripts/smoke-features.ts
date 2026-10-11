/**
 * FEATURES SMOKE TEST (2026-10-11) — Table edit · Complimentary · Delivery (website)
 * ─────────────────────────────────────────────────────────
 * USE CASE: Co-founder brief ke 3 features ko CHALTE server ke against end-to-end check karta
 * hai — har amount paise tak, har role, har galat input. Do nakli cafes (A, B), end mein saaf.
 *
 * ⚠️ Sirf DEV database pe chalao — production DB pe kabhi nahi.
 *
 * KAISE CHALAYE (apps/backend mein):
 *   1. npx tsc   (dist build)
 *   2. PORT=3917 node dist/server.js         ← alag terminal
 *   3. SMOKE_URL=http://localhost:3917 npx tsx scripts/smoke-features.ts
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3917";
const API = `${BASE}/api/v1`;
const TAG = `feat${Date.now()}`;
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
    data: { name: `${TAG} ${label}`, slug: `${TAG}-${label}`.toLowerCase(), address: "Test", phone: "9876500000", organizationId: org.id },
  });
  const mk = (role: "OWNER" | "MANAGER" | "CASHIER" | "CHEF") =>
    prisma.user.create({
      data: {
        name: `${label} ${role}`, email: `${TAG}-${label}-${role}@example.com`.toLowerCase(), phone: "9876500000",
        passwordHash, role, outletId: outlet.id, emailVerified: true, consentAcceptedAt: new Date(),
      },
    });
  const owner = await mk("OWNER");
  const manager = await mk("MANAGER");
  const cashier = await mk("CASHIER");
  const chef = await mk("CHEF");
  const category = await prisma.category.create({ data: { name: "Menu", outletId: outlet.id } });
  const coffee = await prisma.product.create({
    data: { name: "Coffee", price: 100, taxRate: 5, isVeg: true, categoryId: category.id, outletId: outlet.id },
  });
  const cake = await prisma.product.create({
    data: { name: "Cake", price: 200, taxRate: 0, isVeg: true, categoryId: category.id, outletId: outlet.id },
  });
  return { org, outlet, owner, manager, cashier, chef, coffee, cake };
}

async function login(email: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data.accessToken as string;
}

async function main() {
  console.log(`Features smoke test against ${BASE} (tag ${TAG})`);
  const A = await createTenant("A");
  const B = await createTenant("B");

  try {
    const owner = await login(A.owner.email);
    const manager = await login(A.manager.email);
    const cashier = await login(A.cashier.email);
    const chef = await login(A.chef.email);
    const bOwner = await login(B.owner.email);

    // ══════════════ TABLE EDIT ══════════════
    console.log("\nTable edit");
    const t1 = await call("POST", "/tables", owner, { tableNumber: "1", capacity: 4 });
    const t2 = await call("POST", "/tables", manager, { tableNumber: "2", capacity: 2 });
    check("owner + manager add tables → 201", t1.status === 201 && t2.status === 201, [t1.json, t2.json]);
    const t1Id = t1.json?.data?.id as string;
    const t2Id = t2.json?.data?.id as string;
    const dupT = await call("POST", "/tables", owner, { tableNumber: " 1 ", capacity: 2 });
    check("duplicate table name → 409", dupT.status === 409 && dupT.json?.error?.code === "DUPLICATE_TABLE", dupT.json);
    const cashierAdd = await call("POST", "/tables", cashier, { tableNumber: "9", capacity: 2 });
    check("cashier cannot add table → 403", cashierAdd.status === 403, cashierAdd.json);
    const rename = await call("PATCH", `/tables/${t2Id}`, manager, { tableNumber: "Window 1", capacity: 6 });
    check("manager renames + changes seats → 200", rename.status === 200 && rename.json?.data?.tableNumber === "Window 1" && rename.json?.data?.capacity === 6, rename.json);
    const renameDup = await call("PATCH", `/tables/${t2Id}`, owner, { tableNumber: "1" });
    check("rename to an existing name → 409", renameDup.status === 409, renameDup.json);
    const zeroSeats = await call("PATCH", `/tables/${t2Id}`, owner, { capacity: 0 });
    const manySeats = await call("PATCH", `/tables/${t2Id}`, owner, { capacity: 51 });
    const longName = await call("PATCH", `/tables/${t2Id}`, owner, { tableNumber: "x".repeat(21) });
    check("seats 0 / 51 and 21-char name → 400", zeroSeats.status === 400 && manySeats.status === 400 && longName.status === 400, [zeroSeats.status, manySeats.status, longName.status]);
    const cashierEdit = await call("PATCH", `/tables/${t2Id}`, cashier, { capacity: 3 });
    const cashierDel = await call("DELETE", `/tables/${t2Id}`, cashier);
    check("cashier cannot edit or delete tables → 403", cashierEdit.status === 403 && cashierDel.status === 403, [cashierEdit.status, cashierDel.status]);
    const bRename = await call("PATCH", `/tables/${t1Id}`, bOwner, { tableNumber: "Hacked" });
    const bDel = await call("DELETE", `/tables/${t1Id}`, bOwner);
    check("owner B cannot touch A's table → 404", bRename.status === 404 && bDel.status === 404, [bRename.status, bDel.status]);

    const onT1 = await call("POST", "/orders", cashier, { orderType: "DINE_IN", tableId: t1Id, items: [{ productId: A.coffee.id, quantity: 1 }] });
    const list1 = await call("GET", "/tables", cashier);
    const t1Row = (list1.json?.data ?? []).find((t: any) => t.id === t1Id);
    check("table list shows the running order on T1", t1Row?.status === "OCCUPIED" && t1Row?.activeOrders?.[0]?.orderNumber === onT1.json?.data?.orderNumber, t1Row);
    const delBusy = await call("DELETE", `/tables/${t1Id}`, owner);
    check("delete table with running order → 409 TABLE_IN_USE (with order #)", delBusy.status === 409 && delBusy.json?.error?.code === "TABLE_IN_USE" && String(delBusy.json?.message ?? delBusy.json?.error?.message ?? "").includes(`#${onT1.json?.data?.orderNumber}`), delBusy.json);
    await call("POST", `/orders/${onT1.json?.data?.id}/void`, owner, { reason: "testing table delete" });
    const delOk = await call("DELETE", `/tables/${t1Id}`, owner);
    const list2 = await call("GET", "/tables", owner);
    check("after cancel: delete → 200 and hidden from list", delOk.status === 200 && !(list2.json?.data ?? []).some((t: any) => t.id === t1Id), delOk.json);
    const archived = await prisma.table.findUnique({ where: { id: t1Id } });
    check("soft delete: row kept with archivedAt", !!archived?.archivedAt, archived);
    const oldOrder = await call("GET", `/orders/${onT1.json?.data?.id}`, owner);
    check("old order still shows its table name", oldOrder.json?.data?.table?.tableNumber === "1", oldOrder.json?.data?.table);
    const onDeleted = await call("POST", "/orders", cashier, { orderType: "DINE_IN", tableId: t1Id, items: [{ productId: A.coffee.id, quantity: 1 }] });
    check("new order on a deleted table → 404", onDeleted.status === 404, onDeleted.json);
    const pubDeleted = await call("GET", `/public/${A.outlet.slug}/menu?table=${t1Id}`);
    check("deleted table's QR → menu opens without a table", pubDeleted.status === 200 && pubDeleted.json?.data?.table === null, pubDeleted.json?.data?.table);
    const reuse = await call("POST", "/tables", owner, { tableNumber: "1", capacity: 4 });
    check("deleted table's name can be reused", reuse.status === 201, reuse.json);
    const tableAudit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "TABLE_DELETED" } });
    check("TABLE_DELETED audit log", tableAudit?.userId === A.owner.id, tableAudit);

    // ══════════════ COMPLIMENTARY ══════════════
    console.log("\nComplimentary");
    // Stock: coffee recipe (200 ml milk) → free coffee still deducts + cost recorded
    const milk = await call("POST", "/inventory", owner, { name: "Milk", quantity: 10, unit: "L", costPerUnit: 60 });
    await call("PUT", `/inventory/recipes/${A.coffee.id}`, owner, { lines: [{ inventoryItemId: milk.json?.data?.id, quantity: 200, unit: "ml" }] });

    const cashComp = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", complimentaryReason: "Guest", items: [{ productId: A.coffee.id, quantity: 1, complimentary: true }] });
    check("cashier cannot bill complimentary → 403", cashComp.status === 403 && cashComp.json?.error?.code === "COMP_NOT_ALLOWED", cashComp.json);
    const noReason = await call("POST", "/orders", owner, { orderType: "TAKEAWAY", items: [{ productId: A.coffee.id, quantity: 1, complimentary: true }] });
    check("complimentary without reason → 400", noReason.status === 400, noReason.json);
    const pubComp = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Sneaky", customerPhone: "9876511111", complimentaryReason: "free pls", items: [{ productId: A.cake.id, quantity: 1, complimentary: true }],
    });
    check("QR customer cannot make items free → 403", pubComp.status === 403, pubComp.json);

    const milkBefore = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: milk.json?.data?.id } })).quantity;
    const mixed = await call("POST", "/orders", owner, {
      orderType: "TAKEAWAY",
      complimentaryReason: "Guest of owner",
      items: [{ productId: A.coffee.id, quantity: 2, complimentary: true }, { productId: A.cake.id, quantity: 1 }],
    });
    const md = mixed.json?.data;
    check("owner bills 2 free coffees + 1 cake → 201", mixed.status === 201, mixed.json);
    check("bill = cake only: total 200, tax 0, net 200", md?.totalAmount === 200 && md?.taxAmount === 0 && md?.netAmount === 200, md && { t: md.totalAmount, tax: md.taxAmount, net: md.netAmount });
    check("complimentaryValue ₹200 (2 × 100, before tax)", md?.complimentaryValue === 200, md?.complimentaryValue);
    const freeLine = (md?.items ?? []).find((i: any) => i.productId === A.coffee.id);
    check("free line: totalPrice 0, compValue 200, approver + reason saved", freeLine?.totalPrice === 0 && freeLine?.compValue === 200 && freeLine?.compById === A.owner.id && freeLine?.compReason === "Guest of owner", freeLine);
    check("free line cost from recipe: 2 × 200 ml × ₹60/L = ₹24", freeLine?.compCost === 24, freeLine?.compCost);
    const milkAfter = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: milk.json?.data?.id } })).quantity;
    check("free coffees still deduct stock (0.4 L)", Math.abs(milkBefore - milkAfter - 0.4) < 1e-6, [milkBefore, milkAfter]);
    check("mixed bill stays unpaid (cake to collect)", md?.paymentStatus === "UNPAID", md?.paymentStatus);
    const compAudit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "COMPLIMENTARY" } });
    check("COMPLIMENTARY audit log with value + reason", (compAudit?.metadata as any)?.value === 200 && (compAudit?.metadata as any)?.reason === "Guest of owner", compAudit?.metadata);

    const allFree = await call("POST", "/orders", manager, {
      orderType: "TAKEAWAY", complimentaryReason: "Staff meal", items: [{ productId: A.cake.id, quantity: 1, complimentary: true }],
    });
    check("whole bill free → net 0 and PAID automatically", allFree.status === 201 && allFree.json?.data?.netAmount === 0 && allFree.json?.data?.paymentStatus === "PAID", allFree.json?.data && { net: allFree.json.data.netAmount, pay: allFree.json.data.paymentStatus });

    // Comp on an existing order
    const later = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.coffee.id, quantity: 1 }, { productId: A.cake.id, quantity: 1 }] });
    check("normal order: 100 + 5 tax + 200 = 305", later.json?.data?.netAmount === 305, later.json?.data?.netAmount);
    const laterId = later.json?.data?.id as string;
    const coffeeItem = (later.json?.data?.items ?? []).find((i: any) => i.productId === A.coffee.id);
    const cashierLater = await call("POST", `/orders/${laterId}/complimentary`, cashier, { itemIds: [coffeeItem?.id], reason: "Apology" });
    check("cashier cannot comp an order → 403", cashierLater.status === 403, cashierLater.json);
    const badItem = await call("POST", `/orders/${laterId}/complimentary`, manager, { itemIds: [A.cake.id], reason: "Apology" });
    check("unknown item id → 404", badItem.status === 404, badItem.json);
    const compOne = await call("POST", `/orders/${laterId}/complimentary`, manager, { itemIds: [coffeeItem?.id], reason: "Apology" });
    check("manager comps the coffee → net 200 (coffee + its tax removed)", compOne.status === 200 && compOne.json?.data?.netAmount === 200 && compOne.json?.data?.taxAmount === 0, compOne.json?.data && { net: compOne.json.data.netAmount, tax: compOne.json.data.taxAmount });
    const compAgain = await call("POST", `/orders/${laterId}/complimentary`, manager, { itemIds: [coffeeItem?.id], reason: "Apology" });
    check("same item again → 409 NOTHING_TO_COMP", compAgain.status === 409, compAgain.json);
    const compAll = await call("POST", `/orders/${laterId}/complimentary`, owner, { itemIds: "all", reason: "Regular customer" });
    check("comp 'all' → net 0, PAID, value 300", compAll.status === 200 && compAll.json?.data?.netAmount === 0 && compAll.json?.data?.paymentStatus === "PAID" && compAll.json?.data?.complimentaryValue === 300, compAll.json?.data && { net: compAll.json.data.netAmount, pay: compAll.json.data.paymentStatus, v: compAll.json.data.complimentaryValue });
    const paid = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.cake.id, quantity: 1 }] });
    await call("POST", `/orders/${paid.json?.data?.id}/pay`, cashier, { paymentMethod: "CASH" });
    const compPaid = await call("POST", `/orders/${paid.json?.data?.id}/complimentary`, owner, { itemIds: "all", reason: "Apology" });
    check("comp on a paid bill → 409 ALREADY_PAID", compPaid.status === 409 && compPaid.json?.error?.code === "ALREADY_PAID", compPaid.json);
    const payMixed = await call("POST", `/orders/${mixed.json?.data?.id}/pay`, owner, { paymentMethod: "UPI" });
    check("pay mixed bill → ₹200 (free items stay free)", payMixed.status === 200 && payMixed.json?.data?.netAmount === 200, payMixed.json?.data?.netAmount);

    const ins = await call("GET", "/analytics/insights?period=today", owner);
    const c = ins.json?.data?.complimentary;
    check("reports: complimentary value ₹700 (200 + 200 + 300), 3 bills", c?.value === 700 && c?.bills === 3, c && { v: c.value, b: c.bills });
    check("reports: complimentary cost recorded (₹24 + ₹12)", c?.cost === 36, c?.cost);
    check("reports: by approver (owner, manager)", (c?.byApprover ?? []).length === 2, c?.byApprover);
    check("reports: revenue counts only money taken (₹200 + ₹200)", ins.json?.data?.kpis?.revenue === 400, ins.json?.data?.kpis?.revenue);
    const coffeeTop = (ins.json?.data?.items?.top ?? []).find((t: any) => t.productId === A.coffee.id);
    check("reports: free coffees are not 'sold'", !coffeeTop, coffeeTop);
    check("reports: ₹0 bills don't drag the average bill down (avg ₹200)", ins.json?.data?.kpis?.avgBill === 200, ins.json?.data?.kpis?.avgBill);
    const bill = await call("GET", `/public/bills/${mixed.json?.data?.id}`);
    check("customer bill marks free items", (bill.json?.data?.items ?? []).some((i: any) => i.isComplimentary === true && i.totalPrice === 0), bill.json?.data?.items);

    // ══════════════ DELIVERY ══════════════
    console.log("\nDelivery");
    const pubOff = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", deliveryAddress: "12 MG Road, Near Park, Surat", items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("delivery while café has it OFF → 400", pubOff.status === 400, pubOff.json);
    const mgrSettings = await call("PATCH", "/organization/outlet", manager, { deliveryEnabled: true });
    check("manager cannot change delivery settings → 403", mgrSettings.status === 403, mgrSettings.json);
    const badCharge = await call("PATCH", "/organization/outlet", owner, { deliveryCharge: -5 });
    check("negative delivery charge → 400", badCharge.status === 400, badCharge.json);
    const on = await call("PATCH", "/organization/outlet", owner, { deliveryEnabled: true, deliveryCharge: 30, deliveryMinOrder: 250, deliveryArea: "Within 3 km of the café" });
    check("owner turns delivery on (₹30, min ₹250)", on.status === 200 && on.json?.data?.deliveryEnabled === true, on.json);
    const menu = await call("GET", `/public/${A.outlet.slug}/menu`);
    check("public menu shows delivery settings", menu.json?.data?.delivery?.enabled === true && menu.json?.data?.delivery?.charge === 30 && menu.json?.data?.delivery?.minOrder === 250, menu.json?.data?.delivery);
    const noAddr = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("delivery without address → 400", noAddr.status === 400, noAddr.json);
    const shortAddr = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", deliveryAddress: "Surat", items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("too-short address → 400", shortAddr.status === 400, shortAddr.json);
    const noPhone = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", deliveryAddress: "12 MG Road, Near Park, Surat", items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("delivery without phone → 400", noPhone.status === 400, noPhone.json);
    const below = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", deliveryAddress: "12 MG Road, Near Park, Surat", items: [{ productId: A.cake.id, quantity: 1 }],
    });
    check("below minimum (₹200 < ₹250) → 400 DELIVERY_MIN_ORDER", below.status === 400 && below.json?.error?.code === "DELIVERY_MIN_ORDER", below.json);
    const dOrder = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", deliveryAddress: "12 MG Road, Near Park, Surat",
      deliveryCharge: 0, items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("delivery order → 201, net = 400 + ₹30 (client can't set the charge)", dOrder.status === 201 && dOrder.json?.data?.netAmount === 430, dOrder.json);
    const dId = dOrder.json?.data?.id as string;
    const dRow = await prisma.order.findUniqueOrThrow({ where: { id: dId } });
    check("stored: DELIVERY, address, ₹30, status PLACED", dRow.orderType === "DELIVERY" && dRow.deliveryAddress === "12 MG Road, Near Park, Surat" && dRow.deliveryCharge === 30 && dRow.deliveryStatus === "PLACED", dRow);
    const asChef = await call("GET", `/orders/${dId}`, chef);
    check("kitchen (chef) never sees the address or phone", asChef.json?.data?.deliveryAddress == null && asChef.json?.data?.customerPhone == null, asChef.json?.data && { a: asChef.json.data.deliveryAddress, p: asChef.json.data.customerPhone });
    const asCashier = await call("GET", `/orders/${dId}`, cashier);
    check("cashier sees the address", asCashier.json?.data?.deliveryAddress === "12 MG Road, Near Park, Surat", asCashier.json?.data?.deliveryAddress);
    const cashierCharge = await call("PATCH", `/orders/${dId}/delivery`, cashier, { deliveryCharge: 0 });
    check("cashier cannot change delivery charge → 403", cashierCharge.status === 403, cashierCharge.json);
    const mgrCharge = await call("PATCH", `/orders/${dId}/delivery`, manager, { deliveryCharge: 50 });
    check("manager changes charge to ₹50 → net 450", mgrCharge.status === 200 && mgrCharge.json?.data?.netAmount === 450, mgrCharge.json?.data?.netAmount);
    const chargeAudit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "DELIVERY_CHARGE_CHANGE" } });
    check("DELIVERY_CHARGE_CHANGE audit (30 → 50)", (chargeAudit?.metadata as any)?.from === 30 && (chargeAudit?.metadata as any)?.to === 50, chargeAudit?.metadata);
    const out = await call("PATCH", `/orders/${dId}/delivery`, cashier, { deliveryStatus: "OUT_FOR_DELIVERY" });
    check("cashier marks Out for delivery → 200", out.status === 200 && out.json?.data?.deliveryStatus === "OUT_FOR_DELIVERY", out.json);
    const back = await call("PATCH", `/orders/${dId}/delivery`, cashier, { deliveryStatus: "PLACED" });
    check("can't go back a step → 409", back.status === 409, back.json);
    const pay = await call("POST", `/orders/${dId}/pay`, cashier, { paymentMethod: "CASH" });
    check("payment keeps the delivery charge (₹450, not ₹400)", pay.status === 200 && pay.json?.data?.netAmount === 450, pay.json?.data?.netAmount);
    const chargeAfterPay = await call("PATCH", `/orders/${dId}/delivery`, owner, { deliveryCharge: 0 });
    check("charge change after payment → 409", chargeAfterPay.status === 409, chargeAfterPay.json);
    const done = await call("PATCH", `/orders/${dId}/delivery`, cashier, { deliveryStatus: "DELIVERED" });
    check("Delivered → order SERVED", done.status === 200 && done.json?.data?.deliveryStatus === "DELIVERED" && done.json?.data?.orderStatus === "SERVED", done.json?.data && { d: done.json.data.deliveryStatus, o: done.json.data.orderStatus });
    const status = await call("GET", `/public/${A.outlet.slug}/orders/${dId}`);
    check("customer status page sees Delivered + ₹50 charge, no address", status.json?.data?.deliveryStatus === "DELIVERED" && status.json?.data?.deliveryCharge === 50 && !("deliveryAddress" in (status.json?.data ?? {})), status.json?.data);
    const dBill = await call("GET", `/public/bills/${dId}`);
    check("customer bill shows the delivery charge", dBill.json?.data?.deliveryCharge === 50 && dBill.json?.data?.netAmount === 450, dBill.json?.data && { c: dBill.json.data.deliveryCharge, n: dBill.json.data.netAmount });
    const notDelivery = await call("PATCH", `/orders/${paid.json?.data?.id}/delivery`, owner, { deliveryStatus: "DELIVERED" });
    check("delivery update on a takeaway order → 400", notDelivery.status === 400, notDelivery.json);
    const takeawayWithAddr = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Ravi", customerPhone: "9876533333", deliveryAddress: "Should not be stored anywhere", items: [{ productId: A.cake.id, quantity: 1 }],
    });
    const tRow = await prisma.order.findUnique({ where: { id: takeawayWithAddr.json?.data?.id ?? "" } });
    check("takeaway never stores an address", takeawayWithAddr.status === 201 && tRow?.deliveryAddress === null && tRow?.deliveryCharge === 0, tRow && { a: tRow.deliveryAddress, c: tRow.deliveryCharge });
    const csvRes = await fetch(`${API}/analytics/export?period=today&type=orders`, { headers: { authorization: `Bearer ${owner}` } });
    const csv = await csvRes.text();
    check("CSV has delivery charge column, never the address", csv.includes("Delivery charge") && !csv.includes("MG Road"), csv.slice(0, 200));
    const insD = await call("GET", "/analytics/insights?period=today", owner);
    check("reports count the delivery order type", (insD.json?.data?.orderTypes?.DELIVERY?.orders ?? 0) >= 1, insD.json?.data?.orderTypes);
    const offAgain = await call("PATCH", "/organization/outlet", owner, { deliveryEnabled: false });
    const afterOff = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "DELIVERY", customerName: "Asha", customerPhone: "9876522222", deliveryAddress: "12 MG Road, Near Park, Surat", items: [{ productId: A.cake.id, quantity: 2 }],
    });
    check("owner turns delivery off → new delivery orders blocked", offAgain.status === 200 && afterOff.status === 400, afterOff.json);

    // Retention: address deleted after 30 days, like phone
    await prisma.order.update({ where: { id: dId }, data: { createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } });
    const { purgeOldCustomerPhones } = await import("../src/modules/orders/customer-data-retention");
    await purgeOldCustomerPhones();
    const purged = await prisma.order.findUniqueOrThrow({ where: { id: dId } });
    check("after 30 days: address + phone deleted, order + name kept", purged.deliveryAddress === null && purged.customerPhone === null && purged.customerName === "Asha", purged);
  } finally {
    console.log("\nCleanup");
    const ids = [A.outlet.id, B.outlet.id];
    await prisma.auditLog.deleteMany({ where: { outletId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { outletId: { in: ids } } } });
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id] } } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL FEATURE CHECKS PASSED" : `\n${failures} FEATURE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
