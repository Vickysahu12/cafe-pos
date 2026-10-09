/**
 * RECIPES SERVICE
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-09): Stock SOP — "ek Cold Coffee mein 200 ml doodh, 15 g coffee, 1 cup".
 * Recipe optional hai (per item). Order pe stock.service.ts inhi lines se stock kaatta hai.
 *
 * Rules (save pe hi check — galat recipe kabhi DB mein nahi jaati):
 *  - Product + har stock item ISI outlet ke, archived nahi
 *  - Recipe ki unit stock item ki dimension jaisi (doodh L mein hai → ml ya L; "g" nahi)
 *  - Size-wise recipe: variantName product ke kisi size ke naam se match (case-insensitive);
 *    size ka asli naam hi save hota hai. Size ki apni lines nahi → default (sab sizes) lagti hai.
 *  - Poori recipe ek saath replace (transaction) + RECIPE_CHANGE audit log (Owner dekh sake
 *    ki kisne recipe badli — portion chori pakadne ke liye zaroori)
 *
 * Cost / margin: line cost = qty (stock unit mein) × item costPerUnit. Har size ka cost, price,
 * margin aur food cost % — owner ko seedha dikhe "Cold Coffee pe ₹38 lagta hai, ₹120 mein bikta hai".
 *
 * CONNECTED TO: inventory.controller.ts, stock.service.ts, analytics/insights.service.ts
 */

import { prisma } from "../../config/db";
import { round2 } from "../../utils/money";
import { convertQty, round4, sameDimension } from "../../utils/units";
import { logAuditAction } from "../../middleware/audit-logger";
import type { SaveRecipeInput } from "@cafe-pos/shared-schemas";

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}

type Line = {
  variantName: string | null;
  quantity: number;
  unit: string;
  inventoryItem: { id: string; name: string; unit: string; costPerUnit: number; quantity: number };
};

function lineCost(l: Line): number {
  try {
    return convertQty(l.quantity, l.unit, l.inventoryItem.unit) * l.inventoryItem.costPerUnit;
  } catch {
    return 0;
  }
}

/** Har size ka cost: size ki apni lines ho to wahi, warna default */
function sizeCosts(
  price: number,
  variants: { name: string; price: number }[],
  lines: Line[]
) {
  const defaults = lines.filter((l) => l.variantName === null);
  const cost = (ls: Line[]) => round2(ls.reduce((s, l) => s + lineCost(l), 0));
  const row = (name: string | null, p: number, ls: Line[], own: boolean) => {
    const c = cost(ls);
    return {
      variantName: name,
      price: p,
      cost: c,
      margin: round2(p - c),
      foodCostPct: p > 0 ? round2((c / p) * 100) : 0,
      usesOwnRecipe: own,
      hasRecipe: ls.length > 0,
    };
  };
  if (variants.length === 0) return [row(null, price, defaults, true)];
  return variants.map((v) => {
    const own = lines.filter((l) => l.variantName?.toLowerCase() === v.name.toLowerCase());
    return row(v.name, v.price, own.length > 0 ? own : defaults, own.length > 0);
  });
}

async function getProduct(productId: string, outletId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, outletId, archivedAt: null },
    select: { id: true, name: true, price: true, variants: { select: { name: true, price: true }, orderBy: { price: "asc" } } },
  });
  if (!product) httpError("Menu item not found", 404);
  return product;
}

async function loadLines(productId: string, outletId: string): Promise<Line[]> {
  return prisma.recipeLine.findMany({
    where: { productId, outletId },
    select: {
      variantName: true,
      quantity: true,
      unit: true,
      inventoryItem: { select: { id: true, name: true, unit: true, costPerUnit: true, quantity: true } },
    },
    orderBy: [{ variantName: "asc" }, { inventoryItem: { name: "asc" } }],
  });
}

export async function getRecipe(productId: string, outletId: string) {
  const product = await getProduct(productId, outletId);
  const lines = await loadLines(productId, outletId);
  return {
    product: { id: product.id, name: product.name, price: product.price, variants: product.variants },
    lines: lines.map((l) => ({
      variantName: l.variantName,
      inventoryItemId: l.inventoryItem.id,
      itemName: l.inventoryItem.name,
      itemUnit: l.inventoryItem.unit,
      itemQuantity: l.inventoryItem.quantity,
      quantity: l.quantity,
      unit: l.unit,
      cost: round2(lineCost(l)),
    })),
    sizes: sizeCosts(product.price, product.variants, lines),
  };
}

export async function saveRecipe(productId: string, outletId: string, userId: string, input: SaveRecipeInput) {
  const product = await getProduct(productId, outletId);

  // Stock items: isi outlet ke, archived nahi
  const itemIds = [...new Set(input.lines.map((l) => l.inventoryItemId))];
  const items = itemIds.length
    ? await prisma.inventoryItem.findMany({
        where: { id: { in: itemIds }, outletId, archivedAt: null },
        select: { id: true, name: true, unit: true },
      })
    : [];
  const itemBy = new Map(items.map((i) => [i.id, i]));

  const sizeBy = new Map(product.variants.map((v) => [v.name.trim().toLowerCase(), v.name]));
  const clean = input.lines.map((l) => {
    const item = itemBy.get(l.inventoryItemId);
    if (!item) httpError("A stock item in this recipe was not found. Refresh and try again.", 404);
    if (!sameDimension(l.unit, item.unit)) {
      const ok = item.unit === "pcs" ? "pcs" : item.unit === "kg" || item.unit === "g" ? "g or kg" : "ml or L";
      httpError(`${item.name} is stocked in ${item.unit}. Use ${ok} in the recipe.`, 400, "UNIT_MISMATCH");
    }
    let variantName: string | null = null;
    if (l.variantName) {
      variantName = sizeBy.get(l.variantName.trim().toLowerCase()) ?? null;
      if (!variantName) httpError(`"${l.variantName}" is not a size of ${product.name}.`, 400, "UNKNOWN_SIZE");
    }
    return { variantName, inventoryItemId: item.id, quantity: round4(l.quantity), unit: l.unit };
  });
  // Normalise ke baad duplicate (e.g. "large" + "Large") bhi pakdo
  const keys = new Set(clean.map((l) => `${l.variantName ?? ""}|${l.inventoryItemId}`));
  if (keys.size !== clean.length) httpError("The same ingredient is added twice for one size", 400, "DUPLICATE_LINE");

  const before = await prisma.recipeLine.count({ where: { productId, outletId } });
  await prisma.$transaction(async (tx) => {
    await tx.recipeLine.deleteMany({ where: { productId, outletId } });
    if (clean.length > 0) {
      await tx.recipeLine.createMany({ data: clean.map((l) => ({ ...l, productId, outletId })) });
    }
    await logAuditAction(
      {
        userId,
        outletId,
        action: "RECIPE_CHANGE",
        metadata: {
          productId,
          productName: product.name,
          linesBefore: before,
          linesAfter: clean.length,
          lines: clean.map((l) => ({
            item: itemBy.get(l.inventoryItemId)!.name,
            size: l.variantName,
            quantity: l.quantity,
            unit: l.unit,
          })),
        },
      },
      tx
    );
  });
  return getRecipe(productId, outletId);
}

/**
 * Menu list ke liye summary: kis item ki recipe hai, aur default size ka cost / margin.
 * Ek hi query (outlet ki saari recipe lines) — menu screen pe har product ke liye alag call nahi.
 */
export async function getRecipeSummary(outletId: string) {
  const [products, lines] = await Promise.all([
    prisma.product.findMany({
      where: { outletId, archivedAt: null },
      select: { id: true, price: true, variants: { select: { name: true, price: true }, orderBy: { price: "asc" } } },
    }),
    prisma.recipeLine.findMany({
      where: { outletId, product: { archivedAt: null } },
      select: {
        productId: true,
        variantName: true,
        quantity: true,
        unit: true,
        inventoryItem: { select: { id: true, name: true, unit: true, costPerUnit: true, quantity: true } },
      },
    }),
  ]);
  const byProduct = new Map<string, Line[]>();
  for (const { productId, ...l } of lines) {
    const list = byProduct.get(productId) ?? [];
    list.push(l);
    byProduct.set(productId, list);
  }
  const out: Record<string, { lineCount: number; cost: number; price: number; margin: number; foodCostPct: number }> = {};
  for (const p of products) {
    const ls = byProduct.get(p.id);
    if (!ls) continue;
    const first = sizeCosts(p.price, p.variants, ls)[0];
    out[p.id] = { lineCount: ls.length, cost: first.cost, price: first.price, margin: first.margin, foodCostPct: first.foodCostPct };
  }
  return out;
}
