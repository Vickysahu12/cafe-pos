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

type Contact = {
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryLat?: number | null; // ADDED (2026-10-17)
  deliveryLng?: number | null;
};

/** Phone hata ke copy (naam rehta hai). Original object ko nahi chhedta.
 *  UPDATED (2026-10-11): delivery ADDRESS bhi kitchen ko nahi (phone jaisa hi rule).
 *  UPDATED (2026-10-17): GPS pin bhi kitchen ko nahi. */
export function withoutCustomerPhone<T extends Contact>(order: T): T {
  if (!order || (order.customerPhone == null && order.deliveryAddress == null && order.deliveryLat == null)) return order;
  return {
    ...order,
    customerPhone: null,
    ...(order.deliveryAddress != null ? { deliveryAddress: null } : {}),
    ...(order.deliveryLat != null ? { deliveryLat: null, deliveryLng: null } : {}),
  };
}

/** Role ke hisaab se: Chef ko bina phone, baaki ko poora */
export function forRole<T extends Contact>(order: T, role: string | undefined): T {
  return role === "CHEF" ? withoutCustomerPhone(order) : order;
}
