# Cafe POS — Build Progress Log
**Date:** October 12, 2026 (Day 14)
**Focus:** Pre-Play-Store review (4 parallel reviews: mobile, backend, QR website, Play readiness), then fixing everything that blocks launch or costs a café money.

Final launch checklist for Vicky: `D:\cafe-pos\docs\LAUNCH_FINAL_CHECK.md`

---

## Fixes

| # | Area | Problem | Fix | Files |
|---|---|---|---|---|
| 1 | Mobile / legal | In-app Privacy/Terms had `[placeholders]` and a `yourdomain.com` delete URL (Play rejection risk) | Filled with the same values as billraw.in (`billraw-landing/src/data/legal.js`): ALOK KUMAR SAHU / Grewdo, Surat, inclusive GST, 3-month liability, 7-day deletion, grievance name + address | `components/content.ts` |
| 2 | Mobile / legal | Cashier + Chef had no in-app Privacy link | Shield icon → Alert with Privacy / Terms (Android Alert allows 3 buttons, so it's separate from Logout) | `(cashier)/billing.tsx`, `(chef)/kds.tsx` |
| 3 | Mobile | Order detail (a hidden tab that stays mounted) showed the previous order while a new `id` loaded; actions used the new id, so a payment could land on the wrong order. A failed load meant an endless spinner + unhandled rejection | Render only when `order.id === id`; catch → error + Retry + Go back; refund alert uses `formatINR` | `(cashier)/orders/[id].tsx` |
| 4 | Mobile | Checkout kept the last bill's cash/change; empty cart (admin back-history) could POST `items: []`; double tap in one frame | `useFocusEffect` reset, `items.length > 0` guard, `useRef` lock | `(cashier)/checkout.tsx` |
| 5 | Mobile | `restoreSession` logged out on any non-network error (5xx during deploy / Neon cold start) | Clear the session only on `SessionExpiredError` / 401 / 403; otherwise use the cached user | `features/auth/auth.store.ts` |
| 6 | Mobile | Cart survived logout / session expiry | `clearCart()` in both | `features/auth/auth.store.ts` |
| 7 | Mobile | No error boundary | Root `ErrorBoundary` export (Try again; error text only in `__DEV__`) | `app/_layout.tsx` |
| 8 | Mobile | Route groups had no role/consent check (deep link) | `GROUP_ROLES` guard in the root layout → `/` decides | `app/_layout.tsx` |
| 9 | Backend | Add-ons charged into `unitPrice` but never stored, so KDS/bill showed only the product | `order_items.addonNames` snapshot; unknown/stale addon id → 400 `ADDON_NOT_FOUND` (it used to be silently dropped); shown on KDS, order detail, public bill | `orders.service.ts`, `schema.prisma`, migration `20261012100000_order_item_addons`, `public-menu.service.ts`, mobile `orders.api.ts`, `KdsOrderCard.tsx`, web `lib/api.ts`, `bill/[orderId]/page.tsx` |
| 10 | Backend / security | `checkOtp`: read → bcrypt → increment, so parallel guesses got past `MAX_OTP_ATTEMPTS` | Reserve the attempt with a conditional `updateMany` before comparing | `auth.service.ts` |
| 11 | Backend | `updateOrderStatus` could overwrite CANCELLED (race with void) | Transaction + `updateMany where orderStatus != CANCELLED` + `syncTableStatus(tx)` | `orders.service.ts` |
| 12 | Backend + web | QR order: lost response → retry → duplicate order | `clientRequestId` (uuid, optional) in `CreateOrderSchema`; `@@unique([outletId, clientRequestId])`; lookup before create + P2002 fallback; replay skips socket/stock emits; web cart sends one key per cart contents | shared `order.schema.ts`, `schema.prisma`, migration `20261012110000_order_client_request_id`, `orders.service.ts` (`findOrderByClientRequestId`), `public-menu.service.ts`, `public-menu.controller.ts`, web `cart/page.tsx`, `lib/api.ts` |
| 13 | Web | Silent `localhost` fallback for the API URL | Throws in a production build if `NEXT_PUBLIC_API_BASE_URL` is missing | `apps/web/lib/config.ts` |
| 14 | Backend | No `unhandledRejection` / `uncaughtException` handlers | Log; uncaught → graceful shutdown | `server.ts` |
| 15 | Backend / perf | No `order_items.productId` index | Added (same migration as #9) | `schema.prisma` |

## Verification
- `pnpm --filter backend exec tsc --noEmit`: clean
- `pnpm --filter mobile exec tsc --noEmit`: clean
- `pnpm --filter web exec tsc --noEmit` + `pnpm --filter web lint`: clean
- `prisma validate`: valid; `prisma generate` + shared-schemas rebuilt
- **Not run:** migrations against a DB, smoke scripts, a device test. Run `scripts/smoke-security.ts` against dev after `db:migrate`, and the phone test list in `LAUNCH_FINAL_CHECK.md` §2.

## Needs Vicky's decision
- Render free → Starter ($7) before the first paying café (then revert the TEMP lines in `render.yaml`).
- support@billraw.in trial ends 2 Nov 2026.

## Still open (not launch-blocking)
See `LAUNCH_FINAL_CHECK.md` §8: café-closed switch, `/register` OTP send limit, refresh-token rotation + `isActive` check, QR spam per-outlet limit, staff self-erasure, review-link allowlist, web cart re-pricing / hydration / stale table / status 404 polling, `refresh_tokens` cleanup, retention index, `App.tsx` removal, `useActiveOrders` listener leak.
