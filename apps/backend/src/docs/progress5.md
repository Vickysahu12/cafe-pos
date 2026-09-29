# Cafe POS — Build Progress Log
**Date:** September 29, 2026 (Day 5, pre-launch security & launch-blocker pass)
**Status:** All critical security holes found in today's review are FIXED and verified
against a running production build. Remaining launch blockers are listed in §6.

Every changed line carries a `// FIX (2026-09-29): ...` comment at the change site
explaining *why* — search the repo for `FIX (2026-09-29)` to see them all.

---

## 1. Launch blockers fixed

| # | Problem | Fix | Files |
|---|---|---|---|
| 1 | **Production backend crashed on startup.** `node dist/server.js` couldn't load `@cafe-pos/shared-schemas` because the package pointed at raw `.ts` source (worked in dev only because `tsx` compiles on the fly). | Shared packages now build to `dist/` (CommonJS). Turbo builds them before backend `build` and `dev`. Backend `build` also runs `prisma generate` (pnpm blocks Prisma's postinstall). Added `db:deploy` script. | `packages/shared-*/package.json`, `packages/shared-*/tsconfig.json`, `turbo.json`, `apps/backend/package.json` |
| 1b | `pnpm install` failed on any fresh machine/CI: `pnpm-workspace.yaml` had placeholder text `unrs-resolver: set this to true or false`. | Set to `false`. | `pnpm-workspace.yaml` |
| 2 | **Customer QR orders never reached the Chef's KDS in real time**: no socket event was emitted. | Public order now emits `order:created` to the outlet's KDS + POS rooms, same as cashier orders. The public response is also trimmed so internal ids (outletId, cashierId) no longer leak. | `public-menu.controller.ts` |
| 3 | Mobile API URL was a hardcoded LAN IP over plain HTTP, and `app.json` had no app name/package id. | URL now comes from `EXPO_PUBLIC_API_URL`. Release builds refuse to start without it or with non-https. The local value is in `apps/mobile/.env.local` (gitignored). App name → `BillRaw`, Android package / iOS bundle id → `com.billraw.pos` (**confirm this before first Play Store upload; it can never change after**). | `apps/mobile/lib/config.ts`, `app.json`, `.env.example` |
| — | Backend `PORT` had two different defaults (3000 in server.ts, 5000 in env.ts). | Single source: env.ts, default 3000. Graceful shutdown now also closes DB connections. | `server.ts`, `config/env.ts` |

## 2. Security fixes

| # | Hole (before) | Fix |
|---|---|---|
| 7 | **Mass assignment.** `PATCH /menu/categories/:id` passed the raw request body into Prisma, so a Manager could send `outletId` of another cafe or nested relation writes. | New `UpdateCategorySchema` (`.strict()`, only name/sortOrder/isAvailable) + service picks fields explicitly. |
| 8 | **Cross-cafe KDS write.** Chef could update ANY cafe's order item by pairing their own orderId with a foreign itemId. | Item update now requires `itemId` to belong to that `orderId`. Body validated with new `UpdateOrderItemStatusSchema`. |
| 9 | **Unaudited cancel.** Cashier/Chef could set `CANCELLED` via `/status`, bypassing the Owner/Manager-only void and its audit log. | `CANCELLED` removed from the status schema; cancel only via `/void`. Cancelled orders can no longer be revived or edited. |
| 10 | **Discount theft.** Unlimited discount (negative bills), re-paying an already-PAID order to change the discount afterwards, paying cancelled orders, no audit of discounts. | Discount ≤ bill; PAID/CANCELLED orders rejected (409); every discount writes an `APPLY_DISCOUNT` audit log (now visible on the Owner's audit screen); pay runs in a transaction with a conditional update (two devices paying at once → only one wins). |
| 10b | Void + audit log were separate writes (void could succeed with no audit record). Double-void created duplicate logs. Voiding a PAID order left it PAID. | Void + audit in one transaction; double-void → 409; voiding a PAID order sets `REFUNDED` and logs `wasPaid` + amount. |
| 11 | Order `tableId` not checked → order could link to another cafe's table and leak its data. | Table must belong to the outlet. Products in a hidden category also can't be ordered anymore. |
| 12 | `/auth/register` unlimited → OTP email-bombing (costs Resend money) + fake signups. | `registerRateLimiter`: 5 per IP per 15 min (prod). |
| 13 | **Email lock-out.** If someone registered with your email and never verified (or the OTP email failed), the real owner could never sign up: "Email already in use" forever. | Re-registering over an *unverified* Owner replaces that stale org (safe: unverified owners can't log in, so it holds no data). Resend failures are now detected (the SDK returns `{error}` instead of throwing) and the user gets a clear retry message. |
| 13b | Slug bugs: Hindi-only cafe name → empty slug (broken QR URL); race between two same-name signups → 500. | Fallback slug `cafe-xxxxxx`; clean slug first, random suffix + retry on DB unique clash. |
| 13c | Emails were case-sensitive (`Owner@Cafe.com` ≠ `owner@cafe.com`) → duplicate accounts / failed logins. | Stored lowercase; login and duplicate checks are case-insensitive (old mixed-case accounts still work). |
| 14 | 500 errors leaked internal Prisma messages; bad query params (`?orderStatus=abc`, `?date=kal`) crashed with 500. | Error handler maps Prisma errors (duplicate → 409, not found → 404), handles malformed JSON (400), hides 5xx details in production. Orders/audit/analytics query params validated → 400. |
| 15 | Public QR order route: anyone could flood a cafe's KDS with fake orders or send `quantity: 999999`. | `publicOrderRateLimiter` (30 orders / 10 min per IP per cafe, generous for shared cafe WiFi); limits: max 50 items, quantity ≤ 100, ≤ 20 addons. |
| 16 | OTP email inserted the user's name as raw HTML → anyone could send phishing links from our domain. | Name HTML-escaped. |
| 17 | 1 critical + 10 high dependency advisories. | Removed unused `bcrypt` (source of all `tar` advisories; the code uses `bcryptjs`), bumped `morgan`/`express`, pinned patched `qs`. **Backend: 0 advisories.** 4 remain in the mobile Expo build tooling (dev-time only, not shipped). |

## 3. Reliability / correctness fixes

- **KDS went silent after ~15 minutes** (mobile): socket reused its first access token forever; after expiry any reconnect was rejected and never retried. The socket now reads the latest token on every reconnect, refreshes it on rejection, and KDS + orders list refetch on reconnect so events missed while offline aren't lost.
- **Flaky WiFi logged staff out** at app start. A network error now keeps the session (the user profile is cached in SecureStore). Logout happens only when the server rejects the refresh token, and then the app actually navigates to login (before, it stayed on a broken screen).
- **Wrong password showed a generic error.** The 401 from login triggered a token refresh. Auth routes are now excluded from auto-refresh.
- Logout now also closes the socket.
- **Web cart shared across cafes.** Items from Cafe A appeared at Cafe B and the order failed. The cart is now bound to the cafe slug.
- **Money rounding.** All order/tax/discount/analytics math goes through `round2()` (`utils/money.ts`), a stop-gap until the Decimal migration.
- **Analytics mismatch.** Hourly revenue counted unpaid orders while the daily total didn't. Both now use paid only. The daily summary adds `card` and `other` buckets so cash + upi + card + other = total.
- **Scale (1000 cafes).** `/orders` returned an outlet's entire history on every screen focus; it's now capped at 200 latest (max 500, `?limit=`). Audit logs are capped at 300. Response shapes are unchanged, so the mobile app needed no change.
- Pre-existing mobile type errors fixed. The invalid `justify` style key (ignored by React Native, so checkout header + KDS card layout were off) became `justifyContent`. The dashboard's live KPI refresh (`useActiveOrders({ onEvent })`) was silently ignored and now works. `cashierId` was added to the `OrderResponse` type.

## 4. Verification

- `tsc --noEmit` passes for backend, mobile and web (mobile had 4 pre-existing errors; all fixed).
- The production build (`pnpm turbo run build --filter=backend` → `node dist/server.js`) starts and serves `/health`.
- **New: `apps/backend/scripts/smoke-security.ts`**, an end-to-end test against the running built server + dev DB. It creates two throwaway cafes, attempts every attack above, and deletes its data. **Result: ALL 28 CHECKS PASSED.**
- Registration fix tested directly: re-registering an unverified email replaces the stale org (1 account left, lowercase email); a Hindi cafe name gets slug `cafe-xxxxxx`; a failed email shows the retry message. Test data deleted.

## 4b. Second session (same day): launch plan + Day-1 features

**Launch plan written:** `D:\cafe-pos\docs\LAUNCH_PLAN.md`. It covers who does what, the 4-day plan, step-by-step guides for domain/Render/Neon/Resend/Vercel/Play Console/EAS, costs, and the launch-day checklist.

**New features (all have `FIX (2026-09-29)` comments):**

| Feature | Backend | Mobile |
|---|---|---|
| Forgot password (email OTP) | `POST /auth/forgot-password`, `POST /auth/reset-password`. Always the same response whether the email exists or not (no account discovery). Reset logs out all devices. | New `(auth)/forgot-password.tsx`, "Forgot password?" link on login |
| Change password | `POST /auth/change-password`. Other devices logged out; this device gets new tokens | New `(admin)/change-password.tsx`, Settings → Security |
| Staff password reset + deactivate | `POST /auth/staff/:id/reset-password` (same rules as deactivate; audited as `RESET_STAFF_PASSWORD`) | Staff card tap → sheet with Reset Password + Deactivate/Reactivate (deactivate API existed, UI didn't) |
| Delete account (Play Store) | `DELETE /auth/account`: Owner only, password + `"DELETE"`, wipes the whole organization, kicks all staff sockets | New `(admin)/delete-account.tsx`, Settings → Security (Owner only) |
| Edit product | `PATCH /menu/products/:id` (price/tax change → `PRICE_CHANGE` audit log, visible to Owner) | `create-product.tsx` now also edits (tap a product), with an Available toggle |
| Delete product / category | `DELETE /menu/products/:id` (archived if it has past orders, so old bills stay intact), `DELETE /menu/categories/:id` (must be empty) | Delete button on the edit screen; trash icon on the category screen |

**DB migration** `20260929170730_password_reset_and_archive` is additive only (`OtpPurpose` enum + `purpose` column; nullable `archivedAt` on products/categories). Applied to dev. Production gets it via `db:deploy` on first deploy.

**Also fixed:** the login rate limit was keyed by IP only, and a whole cafe shares one WiFi IP, so one staff member's typos could block everyone's login. It's now keyed by IP + account.

**Verification:** smoke test extended to **57 checks, all passing** (menu edit/delete, password reset incl. no-enumeration, cross-outlet staff reset blocked, account deletion wipes only that cafe). Backend, mobile and web all type-check.

**Note:** your `pnpm dev:backend` was running and locks Prisma's engine file on Windows. If `prisma generate` ever fails with `EPERM`, stop the dev server, run it, and restart.

## 5. Needs Vicky's decision / action

1. **Confirm the Android package id `com.billraw.pos`**, or give the one you want. It's permanent after the first Play Store upload.
2. **Pick hosting + domain** for the backend (e.g. Render + `api.<domain>`). Then set `EXPO_PUBLIC_API_URL` in the EAS production profile, `ALLOWED_ORIGINS` for the customer web domain, and verify the domain in Resend (sandbox only emails your own inbox).
3. Voiding a PAID order now marks it `REFUNDED`. If your cafes sometimes void *without* returning money, tell me and we'll add a "refund given?" choice to the void screen.
4. Note: several files were already modified before this session (`app.ts`, `sockets/index.ts`, `order-number.service.ts`, `utils/date.ts`, `login.tsx`, `auth.api.ts`, some web pages). I didn't touch those; they're part of your uncommitted work. Nothing is committed yet. Review with `git diff`, then commit.

## 6. Still open (next session, in priority order)

1. ~~Password reset~~ ✅ done (session 2).
2. ~~Account deletion~~ ✅ in-app done (session 2). The web deletion page goes on Vicky's landing site (see LAUNCH_PLAN §4.6).
3. **Deployment:** `render.yaml`, `eas.json` build profiles, CI running type-check + smoke test.
4. **Float → Decimal migration** for all money columns (proper fix for rounding).
5. ~~Product edit/delete + category delete~~ ✅ done (session 2).
6. Mobile void UI (backend `/void` exists, no screen calls it), staff first-login consent (DPDP), unit tests.
7. Scale follow-ups for 1000+ cafes: proper cursor pagination in the app, the Socket.io Redis adapter if we ever run >1 backend instance, Neon pooled URL with `connection_limit`.
8. Later: subscription billing (Razorpay). Deferred: first ~100 clients pay manually.
