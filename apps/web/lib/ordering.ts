// lib/ordering.ts
// ADDED (2026-10-17): café ne online orders pause kiye hain to customer ko kya dikhana hai.
// CONNECTED TO: app/order/[slug]/page.tsx (banner), cart/page.tsx (Place order band), lib/api.ts (type)

export interface OnlineOrdering {
  open: boolean;
  /** null + open:false = café ne "jab tak wapas na kholein" pause kiya hai */
  pausedUntil: string | null;
}

/** "Back at 4:30 PM" / "" — customer ke phone ke time zone mein */
export function pausedMessage(ordering: OnlineOrdering): string {
  if (ordering.open) return '';
  if (!ordering.pausedUntil) return "This café isn't taking online orders right now. You can still look at the menu.";
  const t = new Date(ordering.pausedUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `This café is busy and will take online orders again at ${t}. You can still look at the menu.`;
}
