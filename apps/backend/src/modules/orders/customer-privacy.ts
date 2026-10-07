/**
 * CUSTOMER CONTACT PRIVACY
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-06)
 *
 * USE CASE: QR order ke saath customer ka naam + phone aata hai. Rule:
 *  - NAAM: sabko (kitchen ko bhi — "#23 · Rahul" bolke counter pe bula sakein)
 *  - PHONE: sirf Owner / Manager / Cashier (call karne ke liye). Chef/KDS ko KABHI nahi —
 *    kitchen ko number ki zaroorat nahi, aur jitne kam log dekhein utna safe (DPDP:
 *    "purpose limitation").
 *
 * Isliye: KDS socket room ko alag (bina phone) payload jaata hai, aur CHEF role ke
 * REST responses se bhi phone hata dete hain.
 *
 * CONNECTED TO: orders.controller.ts, public-menu.controller.ts (socket emits),
 *               customer-data-retention.ts (30 din baad phone delete)
 */

/** Phone hata ke copy (naam rehta hai). Original object ko nahi chhedta. */
export function withoutCustomerPhone<T extends { customerPhone?: string | null }>(order: T): T {
  if (!order || order.customerPhone == null) return order;
  return { ...order, customerPhone: null };
}

/** Role ke hisaab se: Chef ko bina phone, baaki ko poora */
export function forRole<T extends { customerPhone?: string | null }>(order: T, role: string | undefined): T {
  return role === "CHEF" ? withoutCustomerPhone(order) : order;
}
