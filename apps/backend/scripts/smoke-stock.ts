/**
 * STOCK SOP SMOKE TEST (2026-10-09)
 * ─────────────────────────────────────────────────────────
 * USE CASE: Recipes + auto stock deduction + ledger ko CHALTE server ke against end-to-end
 * check karta hai — har number decimal tak. Do nakli cafes (A, B) banata hai, end mein
 * saara data delete (B ka "Delete account" se — stock tables ke saath cascade bhi test).
 *
 * ⚠️ Sirf DEV database pe chalao — production DB pe kabhi nahi.
 *
 * KAISE CHALAYE (apps/backend mein):
 *   1. npx tsc   (dist build)
 *   2. PORT=3917 node dist/server.js         ← alag terminal
 *   3. SMOKE_URL=http://localhost:3917 npx tsx scripts/smoke-stock.ts
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3917";
const API = `${BASE}/api/v1`;
const TAG = `stock${Date.now()}`;
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
const near = (a: number | undefined, b: number, eps = 0.0001) => typeof a === "number" && Math.abs(a - b) < eps;

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
  const category = await prisma.category.create({ data: { name: "Coffee", outletId: outlet.id } });
  const latte = await prisma.product.create({
    data: {
      name: "Latte", price: 150, taxRate: 0, isVeg: true, categoryId: category.id, outletId: outlet.id,
      variants: { create: [{ name: "Regular", price: 150 }, { name: "Large", price: 200 }] },
    },
    include: { variants: true },
  });
  const cookie = await prisma.product.create({
    data: { name: "Cookie", price: 50, taxRate: 0, isVeg: true, categoryId: category.id, outletId: outlet.id },
  });
  return { org, outlet, owner, manager, cashier, chef, latte, cookie };
}

async function login(email: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data.accessToken as string;
}

async function qty(itemId: string) {
  return (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity;
}

async function main() {
  console.log(`Stock smoke test against ${BASE} (tag ${TAG})`);
  const A = await createTenant("A");
  const B = await createTenant("B");
  const regular = A.latte.variants.find((v) => v.name === "Regular")!;
  const large = A.latte.variants.find((v) => v.name === "Large")!;

  try {
    const owner = await login(A.owner.email);
    const manager = await login(A.manager.email);
    const cashier = await login(A.cashier.email);
    const chef = await login(A.chef.email);
    const bOwner = await login(B.owner.email);

    // ── Items ─────────────────────────────────────────────
    console.log("\nStock items");
    const milkR = await call("POST", "/inventory", manager, { name: "Milk", quantity: 10, unit: "L", lowStockAlertAt: 2, costPerUnit: 60 });
    check("manager adds Milk 10 L @ ₹60 → 201", milkR.status === 201 && milkR.json?.data?.quantity === 10 && milkR.json?.data?.unit === "L", milkR.json);
    const milk = milkR.json.data.id as string;
    const coffeeR = await call("POST", "/inventory", owner, { name: "Coffee beans", quantity: 1, unit: "kg", costPerUnit: 800 });
    const coffee = coffeeR.json?.data?.id as string;
    const cupR = await call("POST", "/inventory", owner, { name: "Cup", quantity: 100, unit: "pcs", lowStockAlertAt: 95, costPerUnit: 2 });
    const cup = cupR.json?.data?.id as string;
    check("coffee (kg) + cups (pcs) created", coffeeR.status === 201 && cupR.status === 201, [coffeeR.json, cupR.json]);
    const legacy = await call("POST", "/inventory", owner, { name: "Sugar", quantity: 5, unit: "packets" });
    check("old app unit 'packets' accepted → pcs", legacy.status === 201 && legacy.json?.data?.unit === "pcs", legacy.json);
    const sugar = legacy.json?.data?.id as string;
    const badUnit = await call("POST", "/inventory", owner, { name: "Syrup", quantity: 1, unit: "bottle" });
    check("unknown unit 'bottle' → 400", badUnit.status === 400, badUnit.json);
    const dup = await call("POST", "/inventory", owner, { name: "  milk ", quantity: 1, unit: "L" });
    check("duplicate name 'milk' (any case) → 409", dup.status === 409, dup.json);
    const cashierAdd = await call("POST", "/inventory", cashier, { name: "Tea", quantity: 1, unit: "kg" });
    check("cashier cannot add stock → 403", cashierAdd.status === 403, cashierAdd.json);
    const opening = await prisma.stockMovement.findFirst({ where: { inventoryItemId: milk, type: "OPENING" } });
    check("opening stock written to the ledger", opening?.quantity === 10 && opening?.balanceAfter === 10 && opening?.unitCost === 60, opening);

    // ── Recipes ───────────────────────────────────────────
    console.log("\nRecipes");
    const recipeBody = {
      lines: [
        { variantName: null, inventoryItemId: milk, quantity: 200, unit: "ml" },
        { variantName: null, inventoryItemId: coffee, quantity: 18, unit: "g" },
        { variantName: null, inventoryItemId: cup, quantity: 1, unit: "pcs" },
        { variantName: "large", inventoryItemId: milk, quantity: 300, unit: "ml" }, // lowercase → "Large"
        { variantName: "Large", inventoryItemId: coffee, quantity: 18, unit: "g" },
        { variantName: "Large", inventoryItemId: cup, quantity: 1, unit: "pcs" },
      ],
    };
    const badDim = await call("PUT", `/inventory/recipes/${A.latte.id}`, owner, { lines: [{ inventoryItemId: milk, quantity: 200, unit: "g" }] });
    check("milk (L) in grams → 400 UNIT_MISMATCH", badDim.status === 400 && badDim.json?.error?.code === "UNIT_MISMATCH", badDim.json);
    const badSize = await call("PUT", `/inventory/recipes/${A.latte.id}`, owner, { lines: [{ variantName: "Jumbo", inventoryItemId: milk, quantity: 1, unit: "L" }] });
    check("unknown size 'Jumbo' → 400", badSize.status === 400, badSize.json);
    const dupLine = await call("PUT", `/inventory/recipes/${A.latte.id}`, owner, {
      lines: [{ inventoryItemId: milk, quantity: 1, unit: "L" }, { inventoryItemId: milk, quantity: 2, unit: "ml" }],
    });
    check("same ingredient twice for one size → 400", dupLine.status === 400, dupLine.json);
    const bItem = await call("POST", "/inventory", bOwner, { name: "B milk", quantity: 5, unit: "L" });
    const foreign = await call("PUT", `/inventory/recipes/${A.latte.id}`, owner, { lines: [{ inventoryItemId: bItem.json?.data?.id, quantity: 1, unit: "L" }] });
    check("another cafe's stock item in recipe → 404", foreign.status === 404, foreign.json);
    const bOnA = await call("PUT", `/inventory/recipes/${A.latte.id}`, bOwner, { lines: [] });
    check("owner B cannot touch A's recipe → 404", bOnA.status === 404, bOnA.json);
    const cashierRecipe = await call("PUT", `/inventory/recipes/${A.latte.id}`, cashier, recipeBody);
    check("cashier cannot save recipes → 403", cashierRecipe.status === 403, cashierRecipe.json);
    const saved = await call("PUT", `/inventory/recipes/${A.latte.id}`, manager, recipeBody);
    check("manager saves Latte recipe → 200", saved.status === 200 && saved.json?.data?.lines?.length === 6, saved.json);
    const sizes = saved.json?.data?.sizes ?? [];
    const reg = sizes.find((s: any) => s.variantName === "Regular");
    const lg = sizes.find((s: any) => s.variantName === "Large");
    check("Regular cost ₹28.40 (12 + 14.40 + 2), margin ₹121.60", reg?.cost === 28.4 && reg?.margin === 121.6 && reg?.usesOwnRecipe === false, reg);
    check("Large uses its own recipe, cost ₹34.40", lg?.cost === 34.4 && lg?.usesOwnRecipe === true, lg);
    check("size name normalised to 'Large'", (saved.json?.data?.lines ?? []).filter((l: any) => l.variantName === "Large").length === 3, saved.json?.data?.lines);
    const audit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "RECIPE_CHANGE" } });
    check("RECIPE_CHANGE audit log written", !!audit && audit.userId === A.manager.id, audit);
    const summary = await call("GET", "/inventory/recipes", owner);
    check("recipe summary lists Latte only", summary.status === 200 && !!summary.json?.data?.[A.latte.id] && !summary.json?.data?.[A.cookie.id], summary.json);

    // ── Order deducts stock ───────────────────────────────
    console.log("\nOrders deduct stock");
    const o1 = await call("POST", "/orders", cashier, {
      orderType: "TAKEAWAY",
      items: [
        { productId: A.latte.id, variantId: regular.id, quantity: 2 },
        { productId: A.latte.id, variantId: large.id, quantity: 1 },
        { productId: A.cookie.id, quantity: 1 },
      ],
    });
    check("order with recipe items → 201", o1.status === 201, o1.json);
    check("milk 10 − 0.4 − 0.3 = 9.3 L", near(await qty(milk), 9.3), await qty(milk));
    check("coffee 1 − 0.054 = 0.946 kg", near(await qty(coffee), 0.946), await qty(coffee));
    check("cups 100 − 3 = 97", near(await qty(cup), 97), await qty(cup));
    const o1Items = await prisma.orderItem.findMany({ where: { orderId: o1.json?.data?.id } });
    check("order items remember the size (Large)", o1Items.some((i) => i.variantName === "Large") && o1Items.some((i) => i.variantName === "Regular"), o1Items.map((i) => i.variantName));
    const sales = await prisma.stockMovement.findMany({ where: { orderId: o1.json?.data?.id, type: "SALE" } });
    check("3 SALE ledger rows (one per ingredient), with order # and cashier", sales.length === 3 && sales.every((s) => s.orderNumber === o1.json?.data?.orderNumber && s.userId === A.cashier.id), sales);
    check("sale cost frozen at the time (milk ₹60/L)", sales.find((s) => s.inventoryItemId === milk)?.unitCost === 60, sales);
    check("cookie (no recipe) did not touch stock", near(await qty(sugar), 5));
    check("order response includes stockAlerts array", Array.isArray(o1.json?.data?.stockAlerts), o1.json?.data?.stockAlerts);

    const qr = await call("POST", `/public/${A.outlet.slug}/orders`, undefined, {
      orderType: "TAKEAWAY", customerName: "Asha", customerPhone: "9876511111", items: [{ productId: A.latte.id, variantId: regular.id, quantity: 1 }],
    });
    check("QR order deducts too (milk 9.1)", qr.status === 201 && near(await qty(milk), 9.1), [qr.status, await qty(milk)]);
    check("QR response never leaks stock info", qr.json?.data && !("stockAlerts" in qr.json.data) && !("stockChange" in qr.json.data), qr.json?.data);
    const qrMove = await prisma.stockMovement.findFirst({ where: { orderId: qr.json?.data?.id, type: "SALE" } });
    check("QR sale is by system (userId null)", qrMove !== null && qrMove.userId === null, qrMove);

    // ── Cancel ────────────────────────────────────────────
    console.log("\nCancel returns stock / records wastage");
    const v1 = await call("POST", `/orders/${o1.json?.data?.id}/void`, owner, { reason: "customer left", foodMade: false });
    check("void (food not made) → 200", v1.status === 200, v1.json);
    check("milk back to 9.1 + 0.7 = 9.8", near(await qty(milk), 9.8), await qty(milk));
    check("cups back to 97 + 3 − 1(QR) = 99", near(await qty(cup), 99), await qty(cup));
    const rev = await prisma.stockMovement.count({ where: { orderId: o1.json?.data?.id, type: "SALE_REVERSAL" } });
    check("3 SALE_REVERSAL rows", rev === 3, rev);
    const again = await call("POST", `/orders/${o1.json?.data?.id}/void`, owner, { reason: "second time" });
    check("second void → 409 and stock not returned twice", again.status === 409 && near(await qty(milk), 9.8), [again.status, await qty(milk)]);

    const o2 = await call("POST", "/orders", owner, { orderType: "TAKEAWAY", items: [{ productId: A.latte.id, variantId: large.id, quantity: 1 }] });
    const afterO2 = await qty(milk);
    check("Large latte takes 0.3 L (9.5)", near(afterO2, 9.5), afterO2);
    const v2 = await call("POST", `/orders/${o2.json?.data?.id}/void`, manager, { reason: "dropped the cup", foodMade: true });
    check("void with food made → stock stays used (9.5)", v2.status === 200 && near(await qty(milk), 9.5), await qty(milk));
    const waste = await prisma.stockMovement.findMany({ where: { orderId: o2.json?.data?.id, type: "WASTAGE" } });
    check("…recorded as WASTAGE with the reason", waste.length === 3 && (waste[0].note ?? "").includes("dropped the cup"), waste);
    const cancelAudit = await prisma.auditLog.findFirst({ where: { outletId: A.outlet.id, action: "CANCEL_ORDER" }, orderBy: { timestamp: "desc" } });
    check("cancel audit log says foodMade", (cancelAudit?.metadata as any)?.foodMade === true, cancelAudit?.metadata);
    const o3 = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.cookie.id, quantity: 2 }] });
    const v3 = await call("POST", `/orders/${o3.json?.data?.id}/void`, owner, { reason: "wrong order" });
    check("cancel order without recipes works", v3.status === 200, v3.json);

    // ── Purchase / wastage ───────────────────────────────
    console.log("\nPurchase, wastage");
    const buy = await call("POST", `/inventory/${milk}/purchase`, manager, { quantity: 10, unitCost: 70, note: "Amul" });
    check("purchase 10 L → 19.5 L", buy.status === 200 && near(buy.json?.data?.quantity, 19.5), buy.json);
    check("weighted avg cost (9.5×60 + 10×70) / 19.5 = ₹65.13", buy.json?.data?.costPerUnit === 65.13, buy.json?.data?.costPerUnit);
    const zeroBuy = await call("POST", `/inventory/${milk}/purchase`, manager, { quantity: 0 });
    check("purchase of 0 → 400", zeroBuy.status === 400, zeroBuy.json);
    const wNoReason = await call("POST", `/inventory/${milk}/wastage`, manager, { quantity: 0.5 });
    check("wastage without reason → 400", wNoReason.status === 400, wNoReason.json);
    const w = await call("POST", `/inventory/${milk}/wastage`, manager, { quantity: 0.5, note: "spilled" });
    check("wastage 0.5 L → 19 L", w.status === 200 && near(w.json?.data?.quantity, 19), w.json);
    const bBuy = await call("POST", `/inventory/${milk}/purchase`, bOwner, { quantity: 100 });
    check("owner B cannot add purchase to A's item → 404", bBuy.status === 404 && near(await qty(milk), 19), bBuy.json);
    const bGet = await call("GET", `/inventory/${milk}`, bOwner);
    check("owner B cannot read A's item → 404", bGet.status === 404, bGet.json);

    // ── Concurrency ───────────────────────────────────────
    console.log("\nConcurrency");
    // NOTE: dev laptop → Neon latency kabhi 1s+/query hoti hai (prod: same region, ~2 ms). Isliye
    // yahan "sab 201" nahi maangte — INVARIANT check karte hain: jo order bana uska stock poora
    // kata, jo fail hua uska bilkul nahi (all-or-nothing), aur koi update gum nahi hua.
    const beforeBurst = await qty(milk);
    const cupsBeforeBurst = await qty(cup);
    const ordersBefore = await prisma.order.count({ where: { outletId: A.outlet.id } });
    const burst = await Promise.all(
      Array.from({ length: 10 }, () =>
        call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.latte.id, variantId: regular.id, quantity: 1 }] })
      )
    );
    const ok = burst.filter((b) => b.status === 201).length;
    const created = (await prisma.order.count({ where: { outletId: A.outlet.id } })) - ordersBefore;
    console.log(`     (${ok}/10 succeeded on this network)`);
    check("at least one burst order succeeded", ok >= 1, burst.map((b) => b.status));
    check("every 201 = an order in DB, every failure = nothing saved", created === ok, { ok, created });
    check("milk dropped exactly 0.2 L per successful order (no lost/partial updates)", near(await qty(milk), beforeBurst - 0.2 * ok), [beforeBurst, ok, await qty(milk)]);
    check("cups dropped exactly 1 per successful order", near(await qty(cup), cupsBeforeBurst - ok), [cupsBeforeBurst, ok, await qty(cup)]);
    const burstSales = await prisma.stockMovement.count({ where: { outletId: A.outlet.id, type: "SALE", orderId: { in: burst.map((b) => b.json?.data?.id).filter(Boolean) } } });
    check("ledger has exactly 3 SALE rows per successful order", burstSales === 3 * ok, { burstSales, ok });

    // ── Low / out alerts + availability ──────────────────
    console.log("\nAlerts, availability");
    // Cups alert level 95: 98 se neeche jaate hi EK order ko "LOW" alert milna chahiye. Burst ke
    // successes network pe depend karte hain → yahan seedha cross karwa ke check karte hain.
    const cupsNow = await qty(cup);
    const toCross = Math.max(1, Math.ceil(cupsNow - 95) + 1);
    const crossing: any[] = [];
    for (let i = 0; i < toCross && (await qty(cup)) > 95; i++) {
      crossing.push(await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.latte.id, variantId: regular.id, quantity: 1 }] }));
    }
    const lowHit = [...burst, ...crossing].filter((b) => (b.json?.data?.stockAlerts ?? []).some((a: any) => a.inventoryItemId === cup && a.level === "LOW"));
    check("exactly one order raised the 'cups low' alert", lowHit.length === 1, lowHit.length);
    const after = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.cookie.id, quantity: 1 }] });
    check("no alert on orders without recipes", (after.json?.data?.stockAlerts ?? []).length === 0, after.json?.data?.stockAlerts);
    const cnt0 = await call("POST", "/inventory/counts", manager, { items: [{ inventoryItemId: coffee, actualQuantity: 0 }] });
    check("count coffee to 0 → 201", cnt0.status === 201, cnt0.json);
    const avCashier = await call("GET", "/inventory/availability", cashier);
    check("cashier sees Latte as out of stock (needs coffee)", avCashier.status === 200 && avCashier.json?.data?.out?.includes(A.latte.id), avCashier.json);
    const avChef = await call("GET", "/inventory/availability", chef);
    check("chef cannot read availability → 403", avChef.status === 403, avChef.json);
    const zeroSale = await call("POST", "/orders", cashier, { orderType: "TAKEAWAY", items: [{ productId: A.latte.id, variantId: regular.id, quantity: 1 }] });
    check("billing still works at zero stock (never blocks a sale)", zeroSale.status === 201, zeroSale.json);
    check("coffee goes negative (−0.018 kg) → count signal", near(await qty(coffee), -0.018), await qty(coffee));
    check("no repeat OUT alert once already out", !(zeroSale.json?.data?.stockAlerts ?? []).some((a: any) => a.inventoryItemId === coffee), zeroSale.json?.data?.stockAlerts);

    // ── Stock count (variance) ───────────────────────────
    console.log("\nStock count");
    const milkBefore = await qty(milk);
    const cupBefore = await qty(cup);
    const milkCost = (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: milk } })).costPerUnit; // 65.13
    const count = await call("POST", "/inventory/counts", manager, {
      items: [
        { inventoryItemId: milk, actualQuantity: Math.round((milkBefore - 0.5) * 1000) / 1000 }, // 0.5 L missing
        { inventoryItemId: cup, actualQuantity: cupBefore - 1 }, // 1 cup missing
        { inventoryItemId: coffee, actualQuantity: 2 },
      ],
      note: "night count",
    });
    const lines = count.json?.data?.lines ?? [];
    const mLine = lines.find((l: any) => l.inventoryItemId === milk);
    check("count saved → 201", count.status === 201 && count.json?.data?.itemsCounted === 3, count.json);
    check("milk expected = system qty, variance −0.5", near(mLine?.expected, milkBefore) && near(mLine?.variance, -0.5), [milkBefore, mLine]);
    check("milk cost is the weighted ₹65.13", milkCost === 65.13, milkCost);
    check("milk variance value −0.5 × ₹65.13 = −₹32.57 (rounded away from zero)", mLine?.varianceValue === -32.57, mLine);
    check("missing value total = milk + 1 cup (−₹34.57)", count.json?.data?.missingValue === -34.57, count.json?.data);
    check("biggest loss listed first", lines[0]?.inventoryItemId === milk, lines.map((l: any) => l.name));
    const dupCount = await call("POST", "/inventory/counts", manager, { items: [{ inventoryItemId: milk, actualQuantity: 1 }, { inventoryItemId: milk, actualQuantity: 2 }] });
    check("same item twice in one count → 400", dupCount.status === 400, dupCount.json);
    const negCount = await call("POST", "/inventory/counts", manager, { items: [{ inventoryItemId: milk, actualQuantity: -1 }] });
    check("negative count → 400", negCount.status === 400, negCount.json);
    const foreignCount = await call("POST", "/inventory/counts", bOwner, { items: [{ inventoryItemId: milk, actualQuantity: 0 }] });
    const milkAfterCount = await qty(milk);
    check("owner B cannot count A's item → 404 (and nothing changes)", foreignCount.status === 404 && near(await qty(milk), milkAfterCount) && near(milkAfterCount, milkBefore - 0.5), foreignCount.json);
    const counts = await call("GET", "/inventory/counts", owner);
    check("count history lists both counts, newest first", counts.status === 200 && counts.json?.data?.length === 2 && counts.json.data[0].countId === count.json?.data?.countId, counts.json);
    const countDetail = await call("GET", `/inventory/counts/${count.json?.data?.countId}`, owner);
    check("count detail reproduces the same lines", countDetail.status === 200 && countDetail.json?.data?.missingValue === -34.57 && countDetail.json?.data?.by === A.manager.name, countDetail.json?.data);

    // ── Item detail, edit, archive ───────────────────────
    console.log("\nDetail, edit, archive");
    const detail = await call("GET", `/inventory/${milk}`, owner);
    const types = (detail.json?.data?.movements ?? []).map((m: any) => m.type);
    check("history has every kind of entry", ["OPENING", "SALE", "SALE_REVERSAL", "WASTAGE", "PURCHASE", "COUNT"].every((t) => types.includes(t)), types);
    check("history shows who did it", (detail.json?.data?.movements ?? []).some((m: any) => m.by === A.manager.name), detail.json?.data?.movements?.slice(0, 3));
    check("detail shows it's used in Latte", (detail.json?.data?.usedIn ?? []).some((u: any) => u.productName === "Latte"), detail.json?.data?.usedIn);
    const lastBalance = detail.json?.data?.movements?.[0]?.balanceAfter;
    check("latest ledger balance = item quantity", near(lastBalance, await qty(milk)), [lastBalance, await qty(milk)]);
    const page2 = await call("GET", `/inventory/${milk}?before=${encodeURIComponent(detail.json?.data?.movements?.[1]?.createdAt)}`, owner);
    check("history pagination (before cursor) works", page2.status === 200 && Array.isArray(page2.json?.data?.movements), page2.json);
    const edit = await call("PATCH", `/inventory/${milk}`, manager, { name: "Full cream milk", lowStockAlertAt: 3, costPerUnit: 66 });
    check("edit name / alert / cost → 200", edit.status === 200 && edit.json?.data?.name === "Full cream milk" && edit.json?.data?.costPerUnit === 66, edit.json);
    const editUnit = await call("PATCH", `/inventory/${milk}`, manager, { unit: "ml" });
    check("unit cannot be changed → 400", editUnit.status === 400, editUnit.json);
    const archUsed = await call("DELETE", `/inventory/${coffee}`, owner);
    check("archive item used in a recipe → 409", archUsed.status === 409 && archUsed.json?.error?.code === "ITEM_IN_RECIPES", archUsed.json);
    const arch = await call("DELETE", `/inventory/${sugar}`, owner);
    const list = await call("GET", "/inventory", owner);
    check("archive unused item → hidden from list", arch.status === 200 && !(list.json?.data ?? []).some((i: any) => i.id === sugar), arch.json);
    const reAdd = await call("POST", "/inventory", owner, { name: "Sugar", quantity: 1, unit: "kg" });
    check("archived name can be reused", reAdd.status === 201, reAdd.json);
    check("list has stockValue + recipeCount", (list.json?.data ?? []).some((i: any) => i.id === milk && i.recipeCount === 2 && typeof i.stockValue === "number"), list.json?.data);

    // ── Old app endpoints ────────────────────────────────
    console.log("\nOld app endpoints");
    const cupsLegacy = await qty(cup);
    const legacyAdd = await call("PATCH", `/inventory/${cup}/quantity`, manager, { mode: "ADD", quantity: 5 });
    check("old +/- → ledger ADJUSTMENT", legacyAdd.status === 200 && near(legacyAdd.json?.data?.quantity, cupsLegacy + 5), legacyAdd.json);
    const legacyNeg = await call("PATCH", `/inventory/${cup}/quantity`, manager, { mode: "ADD", quantity: -1000 });
    check("old minus below zero still blocked → 400", legacyNeg.status === 400, legacyNeg.json);
    const legacySet = await call("PATCH", `/inventory/${cup}/quantity`, manager, { mode: "SET", quantity: 50 });
    const setMove = await prisma.stockMovement.findFirst({ where: { inventoryItemId: cup }, orderBy: { createdAt: "desc" } });
    check("old SET → stock count (variance kept)", legacySet.status === 200 && setMove?.type === "COUNT" && near(setMove?.quantity, 50 - (cupsLegacy + 5)), setMove);

    // ── Reports ──────────────────────────────────────────
    console.log("\nReports");
    const ins = await call("GET", "/analytics/insights?period=today", owner);
    const st = ins.json?.data?.stock;
    check("reports: stock section present", ins.status === 200 && st?.hasData === true, st);
    check("reports: COGS > 0 and food cost % computed", st?.cogs > 0 && st?.foodCostPct > 0 && st?.foodCostPct < 100, st);
    check("reports: wastage value includes the dropped Large latte + spill", st?.wastageValue >= 66, st);
    check("reports: stock-count shortage in ₹", st?.countMissingValue > 0, st);
  } finally {
    // ── Cleanup: B via real "Delete account" (stock tables ke saath cascade test), A direct ──
    console.log("\nCleanup");
    const bTok = await login(B.owner.email).catch(() => null);
    if (bTok) {
      const del = await call("DELETE", "/auth/account", bTok, { password: PASSWORD, confirmText: "DELETE" });
      check("owner B deletes account with stock + recipes + ledger → 200", del.status === 200, del.json);
      const left = await prisma.inventoryItem.count({ where: { outletId: B.outlet.id } });
      check("…all of B's stock data gone", left === 0, left);
    }
    await prisma.auditLog.deleteMany({ where: { outletId: { in: [A.outlet.id, B.outlet.id] } } });
    await prisma.orderItem.deleteMany({ where: { order: { outletId: { in: [A.outlet.id, B.outlet.id] } } } });
    await prisma.organization.deleteMany({ where: { id: { in: [A.org.id, B.org.id] } } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nALL STOCK CHECKS PASSED" : `\n${failures} STOCK CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
