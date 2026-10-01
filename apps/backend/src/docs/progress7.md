# Cafe POS — Build Progress Log
**Date:** September 30, 2026 (Day 7, daytime session)
**Focus:** Mobile app UI/UX pass to compete with Petpooja, plus the real bugs found while doing it.

Every change carries a `// FIX (2026-09-30)` or `UI/UX PASS (2026-09-30)` comment.

---

## 1. New shared UI building blocks (`apps/mobile`)

| File | What it does |
|---|---|
| `components/ui/Skeleton.tsx` | Pulsing grey placeholders (`Skeleton`, `SkeletonRow`, `SkeletonList`, `SkeletonStatCard`) that replace full-screen spinners. One shared native-driver animation for the whole app. |
| `components/ui/StateViews.tsx` | `EmptyState` (icon + title + optional action button) and `ErrorState` ("Couldn't load" + **Try Again**). |
| `components/ui/VegMark.tsx` | India's FSSAI veg/non-veg symbol (green dot / brown triangle), replacing "Veg"/"Non-Veg" text and red dots. |
| `lib/product-visual.ts` | Icon + colour from the item/category name (coffee, pizza, cake, juice, chicken…). Before, **every** item and category showed the same Coffee icon. |
| `lib/haptics.ts` | Light vibration on tap / success / error (expo-haptics). |
| `lib/use-screen-load.ts` | One hook for loading + **error** + pull-to-refresh + refetch-on-focus. |
| `features/orders/useNewOrderAlert.ts` | Kitchen chime + vibration on new orders (expo-audio, generated `assets/sounds/new-order.wav`). |

New deps: `expo-haptics`, `expo-audio`, `expo-keep-awake` (all in Expo Go). The `expo-audio` plugin is configured with **no microphone / record / background permissions** (Play Store flags unused sensitive permissions).

## 2. Real bugs fixed (found during the UI pass)

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | **Duplicate orders on checkout.** Create succeeded, pay failed (WiFi blip) → error shown, cart still full → cashier retaps → second order. | Two kitchen tickets, wrong sales | Cart clears as soon as the order exists; a pay failure sends the cashier to that order's screen to collect payment. |
| 2 | **Tax shown as flat 5%** on Billing/Cart/Checkout. | Screen total ≠ actual bill for 0%/12%/18% items | Cart stores each item's `taxRate`; `taxTotal()`/`grandTotal()` use the backend's exact per-line rounding. Label is now "GST". |
| 3 | **Dashboard blank for every Manager.** `Promise.all` + analytics is Owner-only (403) → whole load failed silently. | Managers saw zeros everywhere | `Promise.allSettled`, analytics skipped for Manager, revenue shows "—" (not ₹0), order count from live orders, error banner + tap to retry. |
| 4 | **Most screens had no `catch`.** A network error showed "No staff yet" / "No items yet" / "No orders". | Owner thinks data vanished | `useScreenLoad` + `ErrorState` on Menu, Products, Staff, Tables, Inventory, Audit, Orders; `useActiveOrders` now returns `error`. |
| 5 | **KDS: no sound on new orders; screen goes to sleep.** | Missed orders in a busy kitchen | Chime + vibration + "New order #12 · Table 3" banner (only for truly new orders, not refetches); `useKeepAwake`. |
| 6 | **KDS: newest order first.** | Oldest (most urgent) orders buried | FIFO: oldest first. |
| 7 | KDS didn't listen to `order:item_updated`. | Two chef devices out of sync | Listener added. |
| 8 | **Audit Logs showed raw codes** (`APPLY_DISCOUNT`) for 4 of the 5 action types. | Owner couldn't read discounts/price changes | Every type has a label, icon and a 1-line summary (discount amount, old → new price, refund); filter chips All/Voids/Discounts/Menu/Staff. |
| 9 | Setup checklist: "Add staff" always ✓ (the Owner is in the staff list). | New owners skip adding staff | Counts non-Owner staff only. |
| 10 | Logout on Billing/KDS: one tap, no confirm. | Accidental logout mid-rush | Confirm dialog. |
| 11 | Inventory +/− failure ignored silently. | Owner thinks stock was updated | Error alert + haptic; low-stock items sorted to the top. |
| 12 | Tables sorted as text ("1, 10, 2"); "T5" displayed as "TT5". | Messy table grid | Natural sort; no double "T". |
| 13 | KDS "filter" button did nothing; Delivery chip missing. | Dead UI | Removed / added. |
| 14 | Cart quantity could exceed the backend max (100). | Order rejected at checkout | Capped at 100 in the cart. |

## 3. UI/UX polish

- **Billing:** skeleton that matches the layout, per-item icons + colours, VegMark, "from ₹X" for items with sizes, variant/add-on names in the cart summary, press feedback, search clear (✕), pull-to-refresh, empty states ("Menu is empty" vs "No match for …").
- **Orders list:** **Unpaid (n)** and **Cancelled** filters, skeleton, empty/error states, pull-to-refresh, haptics on Mark Served.
- **Checkout / Order detail:** success/error haptics on payment.
- **Menu / Products / Staff / Tables / Inventory / Audit / Setup / Dashboard:** skeletons, empty states with action buttons ("Add First Category"…), pull-to-refresh, real error messages instead of "Something went wrong".

## 4. Verification

- `tsc --noEmit` passes for mobile, web and backend.
- Customer web production build (`next build`) passes against `https://api.billraw.in`.
- Backend untouched today; the 61-check smoke test from yesterday still applies.
- ⚠️ Not yet tried on a real phone. **Vicky:** run `npx expo start -c` (new native modules) and try Billing, KDS (turn the volume up and place an order from another phone) and Dashboard as both Owner and Manager.

## 4b. Afternoon: customer ordering website rebuilt + per-table QR

Done with the `ui-ux-pro-max` + `frontend-design` skills installed (reviewed for safety first, in `C:\Users\Vicky\.claude\skills\`). Landing page is being built separately by Vicky in the Desktop app (`D:\Billraw-landing\billraw-landing`, own repo).

**Bugs found on the customer site (all fixed):**

| Bug | Fix |
|---|---|
| **"Table 12" hard-coded** on the menu and home page, for every customer | Real table from the QR, or no badge (takeaway) |
| **Status page showed "1 × ₹<whole order total>"** for every item | Backend now returns per-item `totalPrice`, tax and table; the page shows the correct bill |
| **Fake text "Chilled. Fizzy and refreshing."** on every item (checkout + status) | Removed; real variant/add-on/note shown |
| **Tax missing**: screen ₹200, counter bill ₹210 | Cart shows Item total + GST = To pay (same rounding as backend, `lib/money.ts`) |
| "Secure & easy payment" badge with no online payment; bouncing emojis; fake "N Order Tracking" footer; "Illustration Placeholder" box on the home page | Removed; honest "Pay at the counter (cash or UPI)" |
| Back button on the first QR page (went nowhere) | Removed |
| Price showed the first size, not the cheapest | "from ₹X" = min variant (backend sorts variants by price) |
| Non-JSON server errors crashed with "Unexpected token <" | `ApiError` with a friendly message |
| Public menu returned internal DB fields | `select` only what customers need (smaller JSON on 4G) |

**New UX:** one design system (tokens in `globals.css`, shared `components/ui.tsx`: VegMark, QtyStepper with 40px targets, StateScreen, PoweredBy; `lib/product-visual.tsx` replaces 4 copy-pasted icon helpers); **Veg only** toggle; search (menus with more than 8 items); category chips follow scroll; **Checkout merged into Cart** (one tap fewer, `/checkout` redirects); "Track order #N" banner on the menu after ordering; status page pauses polling while the tab is hidden; `noindex` + theme colour; reduced-motion respected.

**Per-table QR (end to end):**
- Backend: `GET /public/:slug/menu?table=<id>` → `table` (validated against the outlet, else null).
- Web: stores the table (expires after 3h) → order is sent as **DINE_IN + tableId** → KDS/cashier see the table.
- App: **My QR Code** has chips *Counter* + every table; each has its own QR (`…/order/<slug>?table=<id>`).
- Smoke test: +6 checks (table returned, other cafe's table rejected, dine-in order, status shape). **All pass.**

## 4c. Evening: Owner Sales Report (demo feature)

**Why:** owners decide with their eyes. "See exactly what you earned each day" is a strong onboarding pitch.

- **Backend:** `GET /analytics/sales-report?days=7|30` (Owner-only; any other `days` value → 400). All aggregation is in SQL (`GROUP BY` IST day via `AT TIME ZONE 'Asia/Kolkata'`, on the existing `orders(outletId, createdAt)` index), so it stays fast at 1000-cafe scale. Returns: a daily series with missing days filled as 0, totals (revenue, orders, average bill), the previous period (for "+12% vs last week"), the payment split and the top 5 items. Definitions match daily-summary (revenue = paid + non-cancelled).
- **App:** new `app/(admin)/sales-report.tsx`, reached from Dashboard → **Net Revenue** (Owner only; shows a › arrow).
  - 7 / 30 days toggle
  - KPI cards with up/down vs the previous period (icon + text, not colour alone)
  - Daily revenue bar chart: tap a bar → that day's ₹ and orders; defaults to today
  - Today by hour, with the busiest hour
  - Payment split as labelled horizontal bars (₹ + %)
  - Top 5 items
  - Skeleton, error/retry, pull-to-refresh
- **Chart:** `components/charts/BarChart.tsx`, hand-built on `react-native-svg` (no new dependency), following the dataviz skill: single brand hue (no legend), 4px rounded data-end anchored to the baseline, recessive grid, compact ₹ axis (₹1.2k / ₹1.5L), column-wide tap targets, screen-reader label per bar. `lib/format.ts` adds Indian ₹ grouping without Intl (Hermes-safe).
- **Tests:** smoke test +7 checks (series length 7/30, totals equal today's daily-summary, top items, bad `days` → 400, cashier → 403, cross-outlet isolation). **All pass.**
- **Skills added** (reviewed first: markdown only, no scripts): `animate-expo`, `mobile-native`, `emil-design-eng`.

## 5. Next

1. **Vercel:** deploy `apps/web` at `order.billraw.in`. Needs env `NEXT_PUBLIC_API_BASE_URL=https://api.billraw.in/api/v1` **and `ENABLE_EXPERIMENTAL_COREPACK=1`** (pnpm 12 lockfile).
2. Android build via EAS (preview APK first, for real-device testing).
3. Vicky: Play Console + expo.dev account; Render card → Starter before the first real cafe.
