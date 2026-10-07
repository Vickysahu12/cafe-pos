// lib/phone.ts
// ADDED (2026-10-06): Indian mobile normalise — backend (packages/shared-schemas
// normalizeIndianMobile) jaisa hi, taaki form pe hi saaf error dikhe, server tak galat na jaaye.
// "+91 98765-43210" / "098765 43210" / "9876543210" → "9876543210"; galat → null.

export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Naam: letters, space, . ' - (backend CustomerNameSchema jaisa), max 40 */
export function isValidCustomerName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 40 && /^[\p{L}\p{M} .'-]+$/u.test(n);
}
