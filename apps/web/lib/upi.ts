// lib/upi.ts
// ADDED (2026-10-18): UPI QR link (darwaze pe delivery boy customer ko dikhata hai) — mobile app ke
// lib/upi.ts jaisa hi. Paisa seedha cafe ke UPI pe; BillRaw beech mein nahi.
// pn/tn mein sirf letters/digits/space (#, & jaise characters kuch UPI apps reject karte hain).
// CONNECTED TO: app/d/[token]/page.tsx

const clean = (s: string, max: number) =>
  s.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildUpiLink(opts: { upiId: string; name: string; amount: number; note?: string }): string | null {
  const amount = Math.round(opts.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
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
