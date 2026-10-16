# Cafe POS — Build Progress Log
**Date:** October 16–17, 2026 (Day 15)
**Focus:** Make BillRaw fit the **one-person business** (stall, cloud kitchen, small café), our edge over Petpooja, without changing anything for cafés with staff. Also the slow "View cart" on the website.

Vicky's decisions:
- Solo is the edge; the Team flow stays exactly as it was.
- These 3 are needed before launch: Solo/Team, online orders on/off, delivery location.

My defaults (change if you disagree):
- Pause online orders: **Owner, Manager and Cashier** can do it; Chef can't.
- Pause options: **30 min / 1 hr / 2 hr** (reopens by itself) or **until turned back on**.
- Existing cafés **with staff → Team** automatically. Without staff → asked once on the Dashboard.

---

## Fixes and features

| # | What | Why | Where |
|---|---|---|---|
| 1 | **"View cart" took 3–4 taps** on order.billraw.in | The cart page started loading only after the tap, nothing showed on screen meanwhile, and Vercel served from the US. Now the cart is **prefetched** once an item is added, the button shows **"Opening ⟳"** and ignores extra taps, `loading.tsx` shows a spinner, and Vercel is set to **Mumbai (`bom1`)** | web `order/[slug]/page.tsx`, `cart/loading.tsx`, `vercel.json` |
| 2 | **Orders stuck without a Chef** | "Ready" only existed on the Chef's KDS, so a solo owner's orders never reached Served or Out for delivery. Now the order screen has **"Food is ready"** for Owner/Manager/Cashier | mobile `(cashier)/orders/[id].tsx` |
| 3 | **Solo / Team mode** | `outlets.workMode` (SOLO / TEAM / null = not chosen). "Just me / With staff" picker on Setup (new cafés) and Dashboard (until chosen), changeable in Settings. **Solo hides** Staff + Audit logs (More, Settings), and Setup becomes Menu → Print QR → Tables (optional) | backend `organization.*`, `auth.service.ts`; mobile `WorkModePicker.tsx`, `outlet.store.ts`, `setup.tsx`, `dashboard.tsx`, `more.tsx`, `settings.tsx` |
| 4 | **Online orders On / Paused** | `outlets.ordersPausedUntil`. Switch on the Dashboard (Owner/Manager) and the Cashier's Orders tab. Website shows "busy / not taking online orders" and the cart's Place order is disabled. Server rejects with 409 `ORDERS_PAUSED`. **Counter billing is not affected.** Audited (`ONLINE_ORDERS_PAUSED/RESUMED` show in Audit logs). Other phones update over socket `outlet:ordering` | backend `utils/ordering.ts`, `public-menu.service.ts`, `organization.*`; mobile `OnlineOrdersSwitch.tsx`; web `lib/ordering.ts`, menu + cart pages |
| 5 | **Delivery: "Use my current location"** | GPS pin on the website cart (delivery only, optional; address is still required for the house number). Stored as `orders.deliveryLat/Lng`, hidden from Chef/KDS, **deleted after 30 days** with the address. The order screen's Maps button opens the **exact pin** | shared `order.schema.ts`, `orders.service.ts`, `customer-privacy.ts`, `customer-data-retention.ts`; web cart; mobile order detail |
| 6 | In-app privacy text | Added delivery address + location pin and their 30-day deletion | `components/content.ts` |

Migration: `20261017100000_solo_mode_pause_location` (enum `WorkMode`, 2 outlet columns, 2 order columns; existing cafés with staff → TEAM).

## Edge cases handled

**Solo / Team**
- "Just me" while active staff exist → blocked: *"You still have active staff (Rahul, Priya). Turn them off in More → Staff first…"*
- In Solo: creating staff or re-activating a staff member → blocked server-side (409 `SOLO_MODE`) with "switch to With staff in Settings".
- Outlet info fails to load (offline) → nothing is hidden (falls back to the full Team view), and the picker isn't shown.
- Logout / session expiry resets the stored mode, so the next user on that phone doesn't see the previous café's mode.

**Online orders pause**
- Pause time runs out → orders open automatically (server compares time on every request; the app card flips to On by itself).
- Customer had the cart open when the café paused → server rejects, cart shows the banner and disables Place order.
- A retry of an order that was placed **before** the pause still returns the same order (idempotency check runs first).
- Table QR customers are also blocked (dine-in via QR is an online order too); the cashier can still bill them at the counter.
- If loading the status fails, the card is hidden rather than showing a wrong state.

**Delivery location**
- Browser without location support or http → no button.
- Permission blocked / timeout / not found → a clear message for each, and the customer can still type the address.
- Accuracy worse than 500 m → "Approximate. Please add a landmark."
- Pin outside India (VPN / bad GPS) → rejected in the browser and on the server.
- The pin is **not** saved in the browser; it's only sent with that order. The customer can remove it.

## Verification
- `tsc --noEmit`: backend, mobile and web all clean · `pnpm --filter web lint`: clean · `prisma validate`: valid
- **Not run:** the migration on a DB, a real phone, the live website. Test list below.

## Phone test (after deploy + new preview APK)
- [ ] New Owner signup → Setup asks "Just me / With staff". Pick Just me: no Staff step, and More has no Staff or Audit logs.
- [ ] Solo: place a QR order → Orders → open it → **Food is ready** → Mark as Served (or for delivery: Out for delivery → Mark delivered).
- [ ] Settings → How you work → Just me, with an active cashier → blocked with the names.
- [ ] Dashboard → Online orders → Pause 30 min → website shows the banner, cart button disabled. Cashier's Orders tab shows Paused within seconds. Turn on → website works again.
- [ ] Website delivery order → "Use my current location" → allow → "Location added" → place → in the app, "Open exact location in Maps" opens the right spot.
- [ ] Deny location permission → message shows, typing the address still works.
- [ ] Website: add an item → "View cart" opens on the first tap.

## Needs Vicky's decision
- The landing page privacy policy (billraw-landing `legal.js`) should also mention the **delivery location pin**. That's your repo, so I haven't touched it.

## Still open
- Same as `LAUNCH_FINAL_CHECK.md` §8.
- Later: delivery radius / area limit, delivery-boy accounts, scheduled opening hours.
