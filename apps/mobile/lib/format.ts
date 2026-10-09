// lib/format.ts
// USE CASE (2026-09-30): ₹ aur date formatting ek jagah — Sales Report aur charts ke liye.
// Intl pe depend nahi karte (Hermes/Android pe en-IN locale data har device pe pakka
// nahi hota), isliye Indian grouping (1,23,456) khud karte hain.

/** ₹1,23,456 ya ₹99.50 — decimals sirf zaroorat pe */
export function formatINR(value: number): string {
  const v = Math.round((value + Number.EPSILON) * 100) / 100;
  const negative = v < 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const decimals = decPart === '00' ? '' : `.${decPart}`;
  return `${negative ? '−' : ''}₹${grouped}${decimals}`;
}

/** Chart axis ke liye chhota: ₹0, ₹850, ₹1.2k, ₹45k, ₹1.5L, ₹2Cr */
export function formatINRCompact(value: number): string {
  const v = Math.abs(value);
  const trim = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));
  if (v >= 1_00_00_000) return `₹${trim(v / 1_00_00_000)}Cr`;
  if (v >= 1_00_000) return `₹${trim(v / 1_00_000)}L`;
  if (v >= 1000) return `₹${trim(v / 1000)}k`;
  return `₹${Math.round(v)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-30" → Date (local, timezone shift ke bina) */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-09-30" → "Wed" */
export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getDay()];
}

/** "2026-09-30" → "30 Sep" */
export function dayMonth(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "2026-09-30" → "Wed, 30 Sep" */
export function fullDay(iso: string): string {
  return `${weekdayShort(iso)}, ${dayMonth(iso)}`;
}

/** 0-23 → "9 AM", "12 PM" */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** ADDED (2026-10-09): ISO timestamp → "9 Oct, 2:14 PM" (phone ke local time mein — IST) */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
