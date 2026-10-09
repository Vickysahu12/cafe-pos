/**
 * INVENTORY SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Stock items ka CRUD — Manager naya stock item add
 * karta hai (jaise "Milk", "Coffee Beans"), quantity update karta
 * hai jaise stock aata/consume hota hai, aur agar quantity kisi
 * item ke liye set threshold se neeche jaaye, Owner ko flag milta
 * hai (PRD ka "Inventory needs to be filled up" wala flow).
 *
 * REWRITE (2026-10-09) — STOCK SOP:
 *  - Quantity ab SIRF ledger se badalti hai (stock.service.ts applyMovement) — har purchase,
 *    wastage, count, sale ki StockMovement row. Purane +/- endpoints bhi ledger se jaate hain.
 *  - Purchase: cost ka weighted average (₹ per unit) → recipe cost / profit / variance ₹ mein.
 *  - Stock count: asli ginti daalo → system vs asli ka farq (variance) qty + ₹ mein, ek session
 *    (countId) mein. Count ke beech koi bill ho to row lock (FOR UPDATE) — hisaab galat nahi hota.
 *  - Delete = archive (history + purani recipes ka record na toote). Recipe mein use ho raha
 *    item archive nahi hota (warna recipe chupchaap kaam karna band kar deti).
 *  - Naam per outlet unique (case-insensitive) — "Milk" do baar = recipe mein confusion.
 *  - Availability: billing screen pe "Out of stock" badge (Cashier bhi dekh sakta hai).
 *
 * CONNECTED TO:
 * - config/db.ts, stock.service.ts (ledger), utils/units.ts
 * - inventory.controller.ts    → HTTP layer isko call karta hai
 * - packages/shared-schemas    → input types
 */

import { randomUUID } from "crypto";
import { prisma } from "../../config/db";
import { round2 } from "../../utils/money";
import { round4, convertQty } from "../../utils/units";
import { applyMovement } from "./stock.service";
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  StockPurchaseInput,
  StockWastageInput,
  StockCountInput,
} from "@cafe-pos/shared-schemas";

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}
function notFound(message: string): never {
  httpError(message, 404);
}

type ItemRow = { id: string; name: string; unit: string; quantity: number; lowStockAlertAt: number; costPerUnit: number };

/** List/detail ka common shape — frontend ko khud calculate na karna pade */
function shape<T extends ItemRow>(item: T) {
  return {
    ...item,
    isOut: item.quantity <= 0,
    // Purana meaning same: quantity <= threshold (threshold 0 pe = khatam hua)
    isLowStock: item.quantity <= item.lowStockAlertAt,
    stockValue: round2(Math.max(0, item.quantity) * item.costPerUnit),
  };
}

async function assertUniqueName(outletId: string, name: string, exceptId?: string) {
  const clash = await prisma.inventoryItem.findFirst({
    where: { outletId, archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) httpError(`"${name}" is already in your stock list`, 409, "DUPLICATE_ITEM");
}

async function getActiveItem(itemId: string, outletId: string) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, outletId, archivedAt: null } });
  if (!item) notFound("Stock item not found");
  return item;
}

/**
 * USE CASE: Naya stock item add karta hai (jaise "Milk", qty 20 litres,
 * threshold 5 — matlab 5 litres se neeche jaate hi alert-worthy ho jayega)
 * UPDATED (2026-10-09): OPENING movement ke saath (history pehle din se), cost bhi.
 */
export async function createInventoryItem(input: CreateInventoryItemInput, outletId: string, userId: string) {
  await assertUniqueName(outletId, input.name);
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        name: input.name,
        quantity: 0,
        unit: input.unit,
        lowStockAlertAt: input.lowStockAlertAt ?? 0,
        costPerUnit: input.costPerUnit ?? 0,
        outletId,
      },
    });
    await applyMovement(tx, {
      outletId,
      inventoryItemId: item.id,
      type: "OPENING",
      delta: input.quantity,
      userId,
      note: "Opening stock",
    });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  });
  return shape(created);
}

/**
 * USE CASE: Outlet ke saare inventory items list karta hai — Manager ka
 * inventory screen isi se banega. Har item ke saath `isLowStock` flag
 * bhi compute karke bhejte hain, taaki frontend ko khud calculate na
 * karna pade — UI mein direct red badge dikha sakte hain.
 * UPDATED (2026-10-09): archived nahi, + isOut, stockValue, recipeCount, lastCountedAt.
 */
export async function getInventoryItems(outletId: string) {
  const [items, lastCounts] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { outletId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { recipeLines: { where: { product: { archivedAt: null } } } } } },
    }),
    prisma.stockMovement.groupBy({
      by: ["inventoryItemId"],
      where: { outletId, type: "COUNT" },
      _max: { createdAt: true },
    }),
  ]);
  const lastCountBy = new Map(lastCounts.map((c) => [c.inventoryItemId, c._max.createdAt]));
  return items.map(({ _count, ...item }) => ({
    ...shape(item),
    recipeCount: _count.recipeLines,
    lastCountedAt: lastCountBy.get(item.id) ?? null,
  }));
}

/**
 * USE CASE: Sirf woh items jo LOW STOCK hain — Owner dashboard ka
 * "Inventory needs to be filled up" alert widget isi endpoint se
 * seedha data lega, poori list se khud filter nahi karna padega.
 */
export async function getLowStockItems(outletId: string) {
  // Prisma direct column-to-column comparison support nahi karta
  // (quantity <= lowStockAlertAt WHERE clause mein), isliye pehle
  // sab laate hain aur JS mein filter karte hain — outlet ka
  // inventory list chhota hota hai (typically <100 items), isliye
  // yeh approach yahan performant hai
  const items = await prisma.inventoryItem.findMany({ where: { outletId, archivedAt: null } });
  return items.filter((item) => item.quantity <= item.lowStockAlertAt).map(shape);
}

/** ADDED (2026-10-09): ek item ki detail — history (movements, cursor pagination), kahan use hota hai */
export async function getInventoryItem(itemId: string, outletId: string, before?: Date) {
  const item = await getActiveItem(itemId, outletId);
  const PAGE = 40;
  const [movements, usedIn] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { inventoryItemId: itemId, outletId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      select: {
        id: true, type: true, quantity: true, balanceAfter: true, unitCost: true, orderNumber: true,
        note: true, createdAt: true, user: { select: { name: true } },
      },
    }),
    prisma.recipeLine.findMany({
      where: { inventoryItemId: itemId, outletId, product: { archivedAt: null } },
      select: { quantity: true, unit: true, variantName: true, product: { select: { id: true, name: true } } },
      orderBy: { product: { name: "asc" } },
    }),
  ]);
  const hasMore = movements.length > PAGE;
  const page = hasMore ? movements.slice(0, PAGE) : movements;
  return {
    item: shape(item),
    movements: page.map(({ user, ...m }) => ({ ...m, by: user?.name ?? null })),
    nextBefore: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    usedIn: usedIn.map((u) => ({
      productId: u.product.id,
      productName: u.product.name,
      variantName: u.variantName,
      quantity: u.quantity,
      unit: u.unit,
    })),
  };
}

/** ADDED (2026-10-09): naam / alert level / cost. Unit locked (recipes + history usi unit mein). */
export async function updateInventoryItem(itemId: string, outletId: string, input: UpdateInventoryItemInput) {
  await getActiveItem(itemId, outletId);
  if (input.name) await assertUniqueName(outletId, input.name, itemId);
  const updated = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.lowStockAlertAt !== undefined ? { lowStockAlertAt: input.lowStockAlertAt } : {}),
      ...(input.costPerUnit !== undefined ? { costPerUnit: input.costPerUnit } : {}),
    },
  });
  return shape(updated);
}

/**
 * ADDED (2026-10-09): Maal aaya. Cost diya to weighted average:
 *   naya cost = (purana stock × purana cost + aaya × naya cost) / (purana + aaya)
 * Purana stock 0/minus ya cost 0 → seedha naya cost. Row lock (FOR UPDATE) — beech mein bill
 * ho to bhi average sahi stock pe bane.
 */
export async function recordPurchase(itemId: string, outletId: string, userId: string, input: StockPurchaseInput) {
  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; quantity: number; costPerUnit: number }[]>`
      SELECT id, quantity, "costPerUnit" FROM inventory_items
      WHERE id = ${itemId} AND "outletId" = ${outletId} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    const cur = rows[0];
    if (!cur) notFound("Stock item not found");

    let newCost = cur.costPerUnit;
    if (input.unitCost !== undefined && input.unitCost > 0) {
      const base = Math.max(0, cur.quantity);
      newCost = base > 0 && cur.costPerUnit > 0
        ? round2((base * cur.costPerUnit + input.quantity * input.unitCost) / (base + input.quantity))
        : input.unitCost;
      await tx.inventoryItem.update({ where: { id: itemId }, data: { costPerUnit: newCost } });
    }
    await applyMovement(tx, {
      outletId,
      inventoryItemId: itemId,
      type: "PURCHASE",
      delta: input.quantity,
      userId,
      unitCost: input.unitCost && input.unitCost > 0 ? input.unitCost : newCost,
      note: input.note ?? null,
    });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  });
  return shape(updated);
}

/** ADDED (2026-10-09): Gira / kharab / expire. Stock se kam (minus bhi ho sakta — asli duniya jeet-ti hai). */
export async function recordWastage(itemId: string, outletId: string, userId: string, input: StockWastageInput) {
  await getActiveItem(itemId, outletId);
  const updated = await prisma.$transaction(async (tx) => {
    await applyMovement(tx, { outletId, inventoryItemId: itemId, type: "WASTAGE", delta: -input.quantity, userId, note: input.note });
    return tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
  });
  return shape(updated);
}

/**
 * ADDED (2026-10-09): STOCK COUNT — din ke end (ya hafte mein) asli ginti. Har item:
 *   variance = asli − system   (minus = gayab: chori, galat portion, bina-bill khana)
 * ₹ = variance × cost. Saari rows ek countId mein (history mein ek "count" dikhe).
 * Items ko id ke order mein lock karte hain (FOR UPDATE) — count ke beech bill ho to wo wait
 * karta hai, ginti aur system dono ek hi pal ke hote hain.
 */
export async function recordStockCount(outletId: string, userId: string, input: StockCountInput) {
  const ids = [...new Set(input.items.map((i) => i.inventoryItemId))].sort();
  const actualBy = new Map(input.items.map((i) => [i.inventoryItemId, i.actualQuantity]));
  const countId = randomUUID();

  const lines = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ItemRow[]>`
      SELECT id, name, unit, quantity, "lowStockAlertAt", "costPerUnit" FROM inventory_items
      WHERE id = ANY(${ids}::text[]) AND "outletId" = ${outletId} AND "archivedAt" IS NULL
      ORDER BY id
      FOR UPDATE
    `;
    if (rows.length !== ids.length) notFound("One or more stock items were not found. Refresh and try again.");

    const out: { inventoryItemId: string; name: string; unit: string; expected: number; actual: number; variance: number; varianceValue: number }[] = [];
    for (const r of rows) {
      const actual = round4(actualBy.get(r.id)!);
      const variance = round4(actual - r.quantity);
      await applyMovement(tx, {
        outletId,
        inventoryItemId: r.id,
        type: "COUNT",
        delta: variance, // 0 bhi likhte hain — "is din gina gaya, sab sahi tha" ka record
        userId,
        countId,
        note: input.note ?? null,
      });
      out.push({
        inventoryItemId: r.id,
        name: r.name,
        unit: r.unit,
        expected: round4(r.quantity),
        actual,
        variance,
        varianceValue: round2(variance * r.costPerUnit),
      });
    }
    return out;
  });

  lines.sort((a, b) => a.varianceValue - b.varianceValue || a.name.localeCompare(b.name)); // sabse bada nuksaan upar
  return {
    countId,
    itemsCounted: lines.length,
    itemsWithVariance: lines.filter((l) => l.variance !== 0).length,
    missingValue: round2(lines.filter((l) => l.varianceValue < 0).reduce((s, l) => s + l.varianceValue, 0)),
    extraValue: round2(lines.filter((l) => l.varianceValue > 0).reduce((s, l) => s + l.varianceValue, 0)),
    lines,
  };
}

/** ADDED (2026-10-09): pichle stock counts (sabse naya pehle) — kab, kisne, kitna ₹ farq */
export async function getStockCounts(outletId: string) {
  const rows = await prisma.$queryRaw<
    { count_id: string; at: Date; items: number; with_variance: number; missing_value: number; extra_value: number; user_name: string | null }[]
  >`
    SELECT
      m."countId" AS count_id,
      MIN(m."createdAt") AS at,
      COUNT(*)::int AS items,
      COUNT(*) FILTER (WHERE m.quantity <> 0)::int AS with_variance,
      COALESCE(SUM(m.quantity * m."unitCost") FILTER (WHERE m.quantity < 0), 0)::float AS missing_value,
      COALESCE(SUM(m.quantity * m."unitCost") FILTER (WHERE m.quantity > 0), 0)::float AS extra_value,
      MAX(u.name) AS user_name
    FROM stock_movements m
    LEFT JOIN users u ON u.id = m."userId"
    WHERE m."outletId" = ${outletId} AND m.type = 'COUNT' AND m."countId" IS NOT NULL
    GROUP BY m."countId"
    ORDER BY at DESC
    LIMIT 20
  `;
  return rows.map((r) => ({
    countId: r.count_id,
    at: r.at,
    itemsCounted: r.items,
    itemsWithVariance: r.with_variance,
    missingValue: round2(r.missing_value),
    extraValue: round2(r.extra_value),
    by: r.user_name,
  }));
}

/** ADDED (2026-10-09): ek count ki poori detail */
export async function getStockCount(outletId: string, countId: string) {
  const rows = await prisma.stockMovement.findMany({
    where: { outletId, countId, type: "COUNT" },
    select: {
      quantity: true, balanceAfter: true, unitCost: true, createdAt: true, note: true,
      user: { select: { name: true } },
      inventoryItem: { select: { id: true, name: true, unit: true } },
    },
  });
  if (rows.length === 0) notFound("Stock count not found");
  const lines = rows
    .map((r) => ({
      inventoryItemId: r.inventoryItem.id,
      name: r.inventoryItem.name,
      unit: r.inventoryItem.unit,
      expected: round4(r.balanceAfter - r.quantity),
      actual: r.balanceAfter,
      variance: r.quantity,
      varianceValue: round2(r.quantity * r.unitCost),
    }))
    .sort((a, b) => a.varianceValue - b.varianceValue || a.name.localeCompare(b.name));
  return {
    countId,
    at: rows[0].createdAt,
    by: rows[0].user?.name ?? null,
    note: rows[0].note,
    itemsCounted: lines.length,
    itemsWithVariance: lines.filter((l) => l.variance !== 0).length,
    missingValue: round2(lines.filter((l) => l.varianceValue < 0).reduce((s, l) => s + l.varianceValue, 0)),
    extraValue: round2(lines.filter((l) => l.varianceValue > 0).reduce((s, l) => s + l.varianceValue, 0)),
    lines,
  };
}

/** ADDED (2026-10-09): delete = archive. Recipe mein laga ho to pehle wahan se hatana padega. */
export async function archiveInventoryItem(itemId: string, outletId: string) {
  await getActiveItem(itemId, outletId);
  const used = await prisma.recipeLine.findMany({
    where: { inventoryItemId: itemId, outletId, product: { archivedAt: null } },
    select: { product: { select: { name: true } } },
    distinct: ["productId"],
    take: 4,
  });
  if (used.length > 0) {
    const names = used.slice(0, 3).map((u) => u.product.name).join(", ");
    httpError(
      `This item is used in recipes (${names}${used.length > 3 ? "…" : ""}). Remove it from those recipes first.`,
      409,
      "ITEM_IN_RECIPES"
    );
  }
  await prisma.inventoryItem.update({ where: { id: itemId }, data: { archivedAt: new Date() } });
  return { id: itemId };
}

/**
 * ADDED (2026-10-09): Billing screen ke badges. Product "OUT" tab jab uska HAR size kisi
 * khatam (≤0) ingredient pe atka ho; "LOW" jab koi ingredient alert level pe ho. Sirf info —
 * bill phir bhi ho sakta hai (ginti galat ho sakti hai).
 */
export async function getProductAvailability(outletId: string) {
  const lines = await prisma.recipeLine.findMany({
    where: { outletId, product: { archivedAt: null }, inventoryItem: { archivedAt: null } },
    select: {
      productId: true,
      variantName: true,
      inventoryItem: { select: { quantity: true, lowStockAlertAt: true } },
    },
  });
  const byProduct = new Map<string, Map<string, { out: boolean; low: boolean }>>();
  for (const l of lines) {
    const groups = byProduct.get(l.productId) ?? new Map();
    const key = l.variantName?.trim().toLowerCase() ?? "";
    const g = groups.get(key) ?? { out: false, low: false };
    if (l.inventoryItem.quantity <= 0) g.out = true;
    if (l.inventoryItem.quantity <= l.inventoryItem.lowStockAlertAt) g.low = true;
    groups.set(key, g);
    byProduct.set(l.productId, groups);
  }
  const out: string[] = [];
  const low: string[] = [];
  for (const [productId, groups] of byProduct) {
    const all = [...groups.values()];
    if (all.every((g) => g.out)) out.push(productId);
    else if (all.some((g) => g.low || g.out)) low.push(productId);
  }
  return { out, low };
}

// ─────────────────────────────────────────────────────────
// Purane app (pehle wale APK) ke endpoints — ab ledger se (history toot-ti nahi)
// ─────────────────────────────────────────────────────────

/**
 * USE CASE: Stock quantity update karta hai — naya stock aane pe
 * (increment) ya consumption/wastage track karne pe (decrement).
 * `mode: "SET" | "ADD"` do use-cases cover karta hai: "SET" jab Manager
 * exact count deta hai (stock-take ke baad), "ADD" jab naya stock aata
 * hai ya wastage entry hoti hai (negative number bhej ke).
 */
export async function updateInventoryQuantity(
  itemId: string,
  outletId: string,
  userId: string,
  input: { mode: "SET" | "ADD"; quantity: number }
) {
  const item = await getActiveItem(itemId, outletId);
  if (input.mode === "SET") {
    if (input.quantity < 0) httpError("Quantity cannot go below zero", 400);
    await recordStockCount(outletId, userId, { items: [{ inventoryItemId: itemId, actualQuantity: input.quantity }] });
  } else {
    if (item.quantity + input.quantity < 0) httpError("Quantity cannot go below zero", 400);
    if (input.quantity === 0) return shape(item);
    await prisma.$transaction((tx) =>
      applyMovement(tx, {
        outletId,
        inventoryItemId: itemId,
        type: "ADJUSTMENT",
        delta: input.quantity,
        userId,
        note: "Quick +/- from stock list",
      })
    );
  }
  return shape(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } }));
}

/**
 * USE CASE: Manager kisi item ka low-stock threshold badal sakta hai
 * (jaise "Milk" ke liye 5 litres se 10 litres kar dena, agar demand badh gayi)
 */
export async function updateThreshold(itemId: string, outletId: string, lowStockAlertAt: number) {
  await getActiveItem(itemId, outletId);
  return shape(await prisma.inventoryItem.update({ where: { id: itemId }, data: { lowStockAlertAt } }));
}

// convertQty re-export: recipes.service ko ek hi jagah se units mile
export { convertQty };
