// lib/money.ts
// USE CASE (2026-09-30): Paise ka hisaab backend jaisa hi (apps/backend/src/utils/money.ts
// + orders.service.ts) — taaki customer ko screen pe jo total dikhe, counter pe bill
// bhi wahi aaye. Pehle website tax dikhati hi nahi thi: ₹200 dikhta, bill ₹210 aata.

/** 2 decimal tak round (paise) */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ₹ formatting Indian style: ₹1,250 ya ₹99.50 (decimal sirf zaroorat pe) */
export function formatINR(value: number): string {
  const v = round2(value);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

interface TaxableLine {
  unitPrice: number;
  quantity: number;
  taxRate: number;
}

/** Subtotal, GST aur total — har line ka tax alag round, phir jod (backend jaisa) */
export function billTotals(lines: TaxableLine[]) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const lineTotal = round2(l.unitPrice * l.quantity);
    subtotal = round2(subtotal + lineTotal);
    tax = round2(tax + round2(lineTotal * ((l.taxRate ?? 0) / 100)));
  }
  return { subtotal, tax, total: round2(subtotal + tax) };
}
