/**
 * ONLINE ORDERS OPEN / PAUSED
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-17)
 *
 * USE CASE: Café QR/website orders thodi der (30 min / 1 ghanta) ya "jab tak main na kholu" band kar
 * sakta hai — rush, gas khatam, akela banda delivery pe gaya, raat ko band. `ordersPausedUntil`
 * future mein hai = band. Time nikal gaya = apne aap khula (koi cron/job nahi chahiye).
 * Counter (staff app) billing pe iska koi asar nahi.
 *
 * CONNECTED TO: organization.service.ts (set), public-menu.service.ts (menu + order check)
 */

/** "Jab tak wapas na kholo" ke liye door ki date — UI isse "until you reopen" padhta hai */
export const PAUSED_INDEFINITELY = new Date("2100-01-01T00:00:00.000Z");

export function isOrderingOpen(ordersPausedUntil: Date | null | undefined, now = new Date()): boolean {
  return !ordersPausedUntil || ordersPausedUntil <= now;
}

/** Public/app response ke liye: { open, pausedUntil (null = jab tak koi na khole) } */
export function orderingStatus(ordersPausedUntil: Date | null | undefined, now = new Date()) {
  const open = isOrderingOpen(ordersPausedUntil, now);
  return {
    open,
    pausedUntil:
      open || !ordersPausedUntil || ordersPausedUntil >= PAUSED_INDEFINITELY ? null : ordersPausedUntil.toISOString(),
  };
}
