/**
 * IST DATE UTILITIES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Cafe ka "business day" hamesha IST (Asia/Kolkata) mein
 * hona chahiye, chahe server kahin bhi deployed ho (Render = UTC).
 * IST mein DST nahi hota, isliye fixed +5:30 offset safe hai — koi
 * timezone library (date-fns-tz etc.) ki zaroorat nahi.
 *
 * CONNECTED TO:
 * - orders/order-number.service.ts → daily-reset counter ka "date" key
 * - analytics/analytics.service.ts → daily summary + hourly sales
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Diye gaye UTC instant ko IST clock-time wale Date object mein convert karta hai
 *  (sirf field-extraction ke liye — .getUTCHours() etc. tab IST hour dega) */
function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/**
 * USE CASE: OrderCounter.date jaisi @db.Date columns ke liye — IST calendar
 * din ko ek stable UTC-midnight Date mein encode karta hai, taaki server
 * timezone se independent ek hi "aaj" sabke liye same rahe.
 */
export function getISTDateOnly(date: Date = new Date()): Date {
  const ist = toIST(date);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** USE CASE: Ek IST calendar din ki actual start/end UTC instants — DB query ke liye */
export function getISTDayRangeUTC(date: Date = new Date()): { start: Date; end: Date } {
  const dateOnly = getISTDateOnly(date); // UTC midnight jo IST date ko represent karta hai
  const start = new Date(dateOnly.getTime() - IST_OFFSET_MS); // asli IST midnight, UTC mein
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/** USE CASE: Kisi bhi UTC timestamp ka IST hour (0-23) — hourly sales ke liye */
export function getISTHour(date: Date): number {
  return toIST(date).getUTCHours();
}

/** USE CASE: Display ke liye "YYYY-MM-DD" IST date string */
export function formatISTDate(date: Date = new Date()): string {
  return getISTDateOnly(date).toISOString().split("T")[0];
}