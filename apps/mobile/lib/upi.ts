// lib/upi.ts
// ADDED (2026-10-18): UPI QR (exact amount)
// USE CASE: `upi://pay?...` link banata hai jo QR mein jaata hai. GPay/PhonePe/Paytm scan karte hi
// cafe ka naam + amount bhara hua dikhta hai. Paisa seedha cafe ke UPI ID pe — BillRaw beech mein nahi.
// Rules (NPCI deep link):
//  - pa = UPI ID, pn = dikhne wala naam, am = amount (2 decimal), cu = INR, tn = note
//  - tn/pn mein #, &, emoji jaise characters kuch apps reject karte hain → sirf letters/digits/space
//  - Ek UPI payment ki seema ₹1,00,000 — usse upar QR nahi banate
// CONNECTED TO: components/payments/UpiQr.tsx

export const UPI_MAX_AMOUNT = 100000;

const clean = (s: string, max: number) =>
  s
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function buildUpiLink(opts: { upiId: string; name: string; amount: number; note?: string }): string | null {
  const amount = Math.round(opts.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > UPI_MAX_AMOUNT) return null;
  const params = [
    `pa=${encodeURIComponent(opts.upiId.trim())}`,
    `pn=${encodeURIComponent(clean(opts.name, 40) || 'Cafe')}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
  ];
  const note = opts.note ? clean(opts.note, 40) : '';
  if (note) params.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${params.join('&')}`;
}

/** Client-side check (server bhi yahi regex chalata hai) */
export const UPI_ID_PATTERN = /^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9.\-]{1,64}$/;
