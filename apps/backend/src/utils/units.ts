/**
 * STOCK UNITS
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-09): Stock SOP. Sirf 5 units — g, kg (wazan), ml, L (volume), pcs (ginti).
 * Recipe "150 ml doodh" likhe aur stock "L" mein rakha ho → 0.15 L kat-ta hai.
 * Alag dimension (g ↔ ml) ka conversion KABHI nahi — density har cheez ki alag hoti hai,
 * galat andaza lagane se behtar error (recipe save pe hi pakda jaata hai).
 *
 * Float drift: 0.1 + 0.2 = 0.30000000000000004 — har result 4 decimal pe round (round4),
 * taaki hazaaron orders ke baad bhi stock "2.9999999 kg" na dikhe.
 *
 * CONNECTED TO: modules/inventory/stock.service.ts, recipes.service.ts. Mobile copy: lib/units.ts
 */

export type StockUnit = "g" | "kg" | "ml" | "L" | "pcs";
type Dimension = "mass" | "volume" | "count";

const UNIT_INFO: Record<StockUnit, { dim: Dimension; factor: number }> = {
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  ml: { dim: "volume", factor: 1 },
  L: { dim: "volume", factor: 1000 },
  pcs: { dim: "count", factor: 1 },
};

export function isStockUnit(u: string): u is StockUnit {
  return u in UNIT_INFO;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

/** Dono units ek hi dimension ke hain? (g↔kg haan, g↔ml nahi) */
export function sameDimension(a: string, b: string): boolean {
  return isStockUnit(a) && isStockUnit(b) && UNIT_INFO[a].dim === UNIT_INFO[b].dim;
}

/** qty ko `from` se `to` unit mein. Alag dimension → error (yeh kabhi DB tak nahi pahunchna chahiye). */
export function convertQty(qty: number, from: string, to: string): number {
  if (from === to) return qty;
  if (!sameDimension(from, to)) {
    throw new Error(`Cannot convert ${from} to ${to}`);
  }
  return round4((qty * UNIT_INFO[from as StockUnit].factor) / UNIT_INFO[to as StockUnit].factor);
}
