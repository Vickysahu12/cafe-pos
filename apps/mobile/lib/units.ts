// lib/units.ts
// ADDED (2026-10-09): Stock SOP — wahi 5 units jo backend (utils/units.ts) samajhta hai.
// Recipe "150 ml" aur stock "L" → convert. Alag dimension (g ↔ ml) kabhi nahi.
// Display: "9.3 L", "450 g", "−0.4 kg" (minus = count karo), 3 decimal tak, faltu zero nahi.
// CONNECTED TO: inventory screens, recipe editor, stock count.

export type StockUnit = 'g' | 'kg' | 'ml' | 'L' | 'pcs';
type Dimension = 'mass' | 'volume' | 'count';

export const STOCK_UNITS: { unit: StockUnit; label: string; hint: string }[] = [
  { unit: 'kg', label: 'kg', hint: 'Kilograms' },
  { unit: 'g', label: 'g', hint: 'Grams' },
  { unit: 'L', label: 'L', hint: 'Litres' },
  { unit: 'ml', label: 'ml', hint: 'Millilitres' },
  { unit: 'pcs', label: 'pcs', hint: 'Pieces, packets, cups' },
];

const INFO: Record<StockUnit, { dim: Dimension; factor: number }> = {
  g: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
  ml: { dim: 'volume', factor: 1 },
  L: { dim: 'volume', factor: 1000 },
  pcs: { dim: 'count', factor: 1 },
};

export function isStockUnit(u: string): u is StockUnit {
  return u in INFO;
}

export function round3(n: number): number {
  return Math.round((n + (n < 0 ? -Number.EPSILON : Number.EPSILON)) * 1000) / 1000;
}

export function sameDimension(a: string, b: string): boolean {
  return isStockUnit(a) && isStockUnit(b) && INFO[a].dim === INFO[b].dim;
}

/** Recipe mein is stock item ke liye kaunse units chal sakte hain (L → ml, L) */
export function compatibleUnits(itemUnit: string): StockUnit[] {
  if (!isStockUnit(itemUnit)) return ['pcs'];
  return (Object.keys(INFO) as StockUnit[]).filter((u) => INFO[u].dim === INFO[itemUnit].dim);
}

/** Recipe ke liye natural chhoti unit: L → ml, kg → g, pcs → pcs */
export function recipeDefaultUnit(itemUnit: string): StockUnit {
  if (itemUnit === 'L') return 'ml';
  if (itemUnit === 'kg') return 'g';
  return isStockUnit(itemUnit) ? itemUnit : 'pcs';
}

export function convertQty(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  if (!sameDimension(from, to)) return null;
  return (qty * INFO[from as StockUnit].factor) / INFO[to as StockUnit].factor;
}

/** 9.3 → "9.3", 0.125 → "0.125", 2 → "2", -0.4 → "−0.4" (typographic minus) */
export function formatNumber(n: number): string {
  const v = round3(n);
  const s = Math.abs(v).toFixed(3).replace(/\.?0+$/, '');
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '−' : ''}${grouped}${dec ? `.${dec}` : ''}`;
}

export function formatQty(n: number, unit: string): string {
  return `${formatNumber(n)} ${unit}`;
}

/** Text input → number (comma ko dot, khaali/galat → null) */
export function parseQty(text: string): number | null {
  const t = text.replace(',', '.').trim();
  if (t === '' || t === '.' || t === '-') return null;
  if (!/^-?\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Quantity input mein sirf number + ek dot (paste kiya kachra saaf) */
export function cleanQtyInput(text: string, maxDecimals = 3): string {
  let t = text.replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot !== -1) t = t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, '');
  const [i, d] = t.split('.');
  return d !== undefined ? `${i.slice(0, 7)}.${d.slice(0, maxDecimals)}` : i.slice(0, 7);
}
