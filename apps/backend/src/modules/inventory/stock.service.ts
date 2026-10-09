/**
 * STOCK LEDGER (bahi-khata)
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-09): Stock SOP ka core. Stock ki quantity SIRF yahan se badalti hai, aur har
 * badlav ke saath ek StockMovement row banti hai (kya, kitna, kisne, kab, kis order se, us waqt
 * ka ₹ cost). Isi se history, wastage, variance aur profit nikalta hai.
 *
 * Vicky ke faisle (2026-10-09):
 *  1. Order PLACE hote hi stock kat-ta hai (kitchen tabhi se use karta hai). Cancel → wapas
 *     (ya khana ban chuka tha to WASTAGE mein).
 *  2. Stock 0 / minus ho tab bhi bill KABHI nahi rukta — app ki ginti galat ho sakti hai, sale
 *     nahi khoni chahiye. Quantity negative jaa sakti hai → "count karo" signal.
 *  3. Units g/kg/ml/L/pcs, recipe aur stock ki unit alag ho to auto convert (utils/units.ts).
 *  4. Recipe optional — jis item ki recipe nahi, uska stock nahi kat-ta.
 *
 * Safety:
 *  - Sab functions transaction client (tx) lete hain → order bana to stock kata, dono ya koi nahi.
 *  - Quantity update ATOMIC (`increment`), read-modify-write nahi → do counters ek saath bill
 *    karein to bhi ek bhi ml gayab nahi.
 *  - Ek transaction mein kai items → hamesha id ke order mein update (deadlock nahi hota jab do
 *    orders same ingredients ulte order mein chhuen).
 *  - Har quantity 4 decimal pe round (float drift nahi).
 *  - Reversal recipe se NAHI, us order ki asli SALE movements se — beech mein recipe badli ho
 *    to bhi utna hi wapas aata hai jitna kata tha.
 *
 * CONNECTED TO: orders.service.ts (createOrder / voidOrder), inventory.service.ts (purchase,
 * wastage, count), analytics/insights.service.ts (cost, wastage, variance).
 */

import type { Prisma, StockMovementType } from "@prisma/client";
import { convertQty, round4 } from "../../utils/units";

type Tx = Prisma.TransactionClient;

export interface StockAlert {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockAlertAt: number;
  level: "LOW" | "OUT";
}

export interface StockChange {
  /** Is order ne koi stock chhua? (recipe wale items the) */
  changed: boolean;
  /** Is order ki wajah se jo items abhi-abhi LOW ya OUT hue (pehle nahi the) */
  alerts: StockAlert[];
}

interface MoveInput {
  outletId: string;
  inventoryItemId: string;
  type: StockMovementType;
  delta: number; // + aaya, − gaya (item ki unit mein)
  userId?: string | null;
  orderId?: string | null;
  orderNumber?: number | null;
  countId?: string | null;
  note?: string | null;
  unitCost?: number; // na diya to item ka abhi ka costPerUnit
}

/**
 * Ek item pe ek movement: atomic increment + ledger row. Item isi outlet ka hai yeh CALLER
 * pehle check karta hai (yahan sirf id se update hota hai).
 */
export async function applyMovement(tx: Tx, m: MoveInput) {
  const delta = round4(m.delta);
  let item = await tx.inventoryItem.update({
    where: { id: m.inventoryItemId },
    data: { quantity: { increment: delta } },
    select: { id: true, name: true, unit: true, quantity: true, costPerUnit: true, lowStockAlertAt: true },
  });
  // Float drift saaf: 2.9999999 → 3
  const clean = round4(item.quantity);
  if (clean !== item.quantity) {
    item = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: clean },
      select: { id: true, name: true, unit: true, quantity: true, costPerUnit: true, lowStockAlertAt: true },
    });
  }
  await tx.stockMovement.create({
    data: {
      outletId: m.outletId,
      inventoryItemId: m.inventoryItemId,
      type: m.type,
      quantity: delta,
      balanceAfter: item.quantity,
      unitCost: m.unitCost ?? item.costPerUnit,
      orderId: m.orderId ?? null,
      orderNumber: m.orderNumber ?? null,
      countId: m.countId ?? null,
      userId: m.userId ?? null,
      note: m.note ?? null,
    },
  });
  return { item, before: round4(item.quantity - delta) };
}

/** Pehle LOW/OUT nahi tha aur ab hai → alert (har order pe baar-baar nahi) */
function crossedAlert(
  item: { id: string; name: string; unit: string; quantity: number; lowStockAlertAt: number },
  before: number
): StockAlert | null {
  const after = item.quantity;
  if (after <= 0 && before > 0) {
    return { inventoryItemId: item.id, name: item.name, unit: item.unit, quantity: after, lowStockAlertAt: item.lowStockAlertAt, level: "OUT" };
  }
  if (item.lowStockAlertAt > 0 && after <= item.lowStockAlertAt && before > item.lowStockAlertAt && after > 0) {
    return { inventoryItemId: item.id, name: item.name, unit: item.unit, quantity: after, lowStockAlertAt: item.lowStockAlertAt, level: "LOW" };
  }
  return null;
}

/**
 * Order ki items ke hisaab se kitna stock lagega — recipe se. Size ki apni recipe ho
 * (variantName match, case-insensitive) to wahi, warna default (variantName null).
 * Returns: inventoryItemId → item ki unit mein total quantity.
 */
export async function computeConsumption(
  tx: Tx,
  outletId: string,
  lines: { productId: string; variantName: string | null; quantity: number }[]
): Promise<Map<string, number>> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const need = new Map<string, number>();
  if (productIds.length === 0) return need;

  const recipe = await tx.recipeLine.findMany({
    where: { outletId, productId: { in: productIds }, inventoryItem: { archivedAt: null } },
    select: { productId: true, variantName: true, inventoryItemId: true, quantity: true, unit: true, inventoryItem: { select: { unit: true } } },
  });
  if (recipe.length === 0) return need;

  const byProduct = new Map<string, typeof recipe>();
  for (const r of recipe) {
    const list = byProduct.get(r.productId) ?? [];
    list.push(r);
    byProduct.set(r.productId, list);
  }

  for (const line of lines) {
    const all = byProduct.get(line.productId);
    if (!all) continue; // recipe nahi → stock nahi kat-ta (optional recipes)
    const size = line.variantName?.trim().toLowerCase() ?? null;
    const sizeLines = size ? all.filter((r) => r.variantName?.trim().toLowerCase() === size) : [];
    const use = sizeLines.length > 0 ? sizeLines : all.filter((r) => r.variantName === null);
    for (const r of use) {
      let perItem: number;
      try {
        perItem = convertQty(r.quantity, r.unit, r.inventoryItem.unit);
      } catch {
        continue; // recipe save pe hi rok dete hain; purana galat data bill na roke
      }
      need.set(r.inventoryItemId, round4((need.get(r.inventoryItemId) ?? 0) + perItem * line.quantity));
    }
  }
  return need;
}

// ─────────────────────────────────────────────────────────
// BULK path (order create / cancel) — FIX (2026-10-09) rush-hour speed.
// Smoke test mein 10 orders ek saath → 5 fail ("transaction timeout 15s"): har order ka
// transaction per-ingredient 3 queries karta tha (update + round + movement), aur saare orders
// same hot rows (aaj ka order counter, Milk) pe line mein lagte hain. Ab ingredients kitne bhi
// hon, sirf 3 queries: (1) rows LOCK id-order mein (deadlock nahi), (2) ek UPDATE mein saari
// quantities, (3) ek INSERT mein saari ledger rows. Lock ke andar naya balance JS mein nikalte
// hain → atomic aur exact (koi lost update nahi).
// ─────────────────────────────────────────────────────────

type LockedRow = { id: string; name: string; unit: string; quantity: number; costPerUnit: number; lowStockAlertAt: number };

async function lockItems(tx: Tx, ids: string[]): Promise<Map<string, LockedRow>> {
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return new Map();
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT id, name, unit, quantity, "costPerUnit", "lowStockAlertAt"
    FROM inventory_items
    WHERE id = ANY(${sorted}::text[])
    ORDER BY id
    FOR UPDATE
  `;
  return new Map(rows.map((r) => [r.id, r]));
}

async function setQuantities(tx: Tx, next: Map<string, number>) {
  if (next.size === 0) return;
  const ids = [...next.keys()];
  const qs = ids.map((id) => next.get(id)!);
  await tx.$executeRaw`
    UPDATE inventory_items AS i
    SET quantity = v.q, "updatedAt" = NOW()
    FROM (SELECT unnest(${ids}::text[]) AS id, unnest(${qs}::float8[]) AS q) AS v
    WHERE i.id = v.id
  `;
}

/** Order place hua → recipe ke hisaab se stock kaato (SALE movements). Bill kabhi nahi rukta. */
export async function deductStockForOrder(
  tx: Tx,
  p: {
    outletId: string;
    orderId: string;
    orderNumber: number;
    userId: string | null;
    lines: { productId: string; variantName: string | null; quantity: number }[];
    /** Pehle se nikala hua (createOrder counter lock se PEHLE nikalta hai — lock kam der) */
    need?: Map<string, number>;
  }
): Promise<StockChange> {
  const need = p.need ?? (await computeConsumption(tx, p.outletId, p.lines));
  const ids = [...need.keys()].filter((id) => (need.get(id) ?? 0) > 0);
  if (ids.length === 0) return { changed: false, alerts: [] };

  const locked = await lockItems(tx, ids);
  const next = new Map<string, number>();
  const moves: Prisma.StockMovementCreateManyInput[] = [];
  const alerts: StockAlert[] = [];
  for (const id of [...ids].sort()) {
    const row = locked.get(id);
    if (!row) continue; // beech mein archive/delete — bill nahi rukta
    const qty = need.get(id)!;
    const after = round4(row.quantity - qty);
    next.set(id, after);
    moves.push({
      outletId: p.outletId,
      inventoryItemId: id,
      type: "SALE",
      quantity: -qty,
      balanceAfter: after,
      unitCost: row.costPerUnit,
      orderId: p.orderId,
      orderNumber: p.orderNumber,
      userId: p.userId,
    });
    const alert = crossedAlert({ ...row, quantity: after }, row.quantity);
    if (alert) alerts.push(alert);
  }
  await setQuantities(tx, next);
  if (moves.length) await tx.stockMovement.createMany({ data: moves });
  return { changed: moves.length > 0, alerts };
}

/**
 * Order cancel hua → us order ki SALE movements ka ulta. foodMade = true (khana ban chuka tha,
 * phenkna pada) → stock wapas NAHI aata, wahi quantity WASTAGE ban jaati hai (reports mein
 * "cancelled food" dikhe, sale ke cost mein nahi).
 */
export async function reverseStockForOrder(
  tx: Tx,
  p: { outletId: string; orderId: string; orderNumber: number; userId: string; foodMade: boolean; reason?: string }
): Promise<StockChange> {
  const prior = await tx.stockMovement.findMany({
    where: { outletId: p.outletId, orderId: p.orderId, type: { in: ["SALE", "SALE_REVERSAL"] } },
    select: { inventoryItemId: true, type: true, quantity: true, unitCost: true },
  });
  // Pehle se reverse ho chuka (double cancel kabhi pahunche) → kuch nahi
  if (prior.length === 0 || prior.some((m) => m.type === "SALE_REVERSAL")) return { changed: false, alerts: [] };

  // Item-wise kitna kata tha + us waqt ka cost (baad mein cost badla ho to bhi hisaab sahi)
  const back = new Map<string, { qty: number; unitCost: number }>();
  for (const m of prior) {
    const e = back.get(m.inventoryItemId) ?? { qty: 0, unitCost: m.unitCost };
    e.qty = round4(e.qty - m.quantity); // SALE negative → wapas positive
    back.set(m.inventoryItemId, e);
  }
  const ids = [...back.keys()].filter((id) => back.get(id)!.qty > 0);
  if (ids.length === 0) return { changed: false, alerts: [] };

  const locked = await lockItems(tx, ids);
  const next = new Map<string, number>();
  const moves: Prisma.StockMovementCreateManyInput[] = [];
  const wasteNote = `Cancelled order #${p.orderNumber} (food already made)${p.reason ? `: ${p.reason}` : ""}`.slice(0, 200);
  for (const id of [...ids].sort()) {
    const row = locked.get(id);
    if (!row) continue;
    const { qty, unitCost } = back.get(id)!;
    const returned = round4(row.quantity + qty);
    const base = { outletId: p.outletId, inventoryItemId: id, unitCost, orderId: p.orderId, orderNumber: p.orderNumber, userId: p.userId };
    moves.push({ ...base, type: "SALE_REVERSAL", quantity: qty, balanceAfter: returned });
    if (p.foodMade) {
      // Wapas aaya aur usi pal phenka gaya → quantity wahi rehti hai, wastage record hota hai
      moves.push({ ...base, type: "WASTAGE", quantity: -qty, balanceAfter: row.quantity, note: wasteNote });
    } else {
      next.set(id, returned);
    }
  }
  await setQuantities(tx, next);
  if (moves.length) await tx.stockMovement.createMany({ data: moves });
  return { changed: moves.length > 0, alerts: [] };
}
