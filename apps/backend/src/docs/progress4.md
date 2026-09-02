# Cafe POS — Build Progress Log
**Date:** August 31, 2026 (Day 4)
**Status:** ALL 8 backend modules complete and fully tested. Backend core is DONE.
Frontend (mobile app) starts next session.

---

## 1. What We Built Today — 6 Modules in One Day

### Inventory Module
- `inventory.service.ts` — stock item CRUD, quantity update in two modes (`SET` — exact
  count after a stock-take, `ADD` — increment/decrement for restock or wastage),
  per-item low-stock threshold (`lowStockAlertAt`)
- `getInventoryItems()` returns each item with a computed `isLowStock` flag so the
  frontend never has to calculate it
- `getLowStockItems()` — dedicated endpoint for the Owner's "needs refill" alert widget
- Whole module is OWNER/MANAGER only (`router.use(authorize(...))` at the top, since
  every endpoint needs the same restriction — cleaner than repeating it per-route)

### Tables Module
- `tables.service.ts` — create table, list tables, update status
  (AVAILABLE/OCCUPIED/RESERVED)
- Smallest module — no new concepts, direct reuse of the established outlet-scoping
  pattern
- RBAC: create is OWNER/MANAGER only; status updates also allow CASHIER (per PRD's
  "Table Allocation & Switch" row)

### Organization Module
- `organization.service.ts` — read/update outlet details (name, address, phone, GST
  number). Creating a new organization/outlet is NOT here — that already happens
  atomically inside `auth.service.ts`'s `registerOrganization()` during signup.
- `getOrganizationOutlets()` — lists all outlets under one organization, ready for when
  multi-outlet support is needed later
- Update restricted to OWNER only

### Audit Module
- `audit.service.ts` — **read-only**. Writing audit entries already existed
  (`middleware/audit-logger.ts`, used by `orders.service.ts`'s `voidOrder()`)
- `getAuditLogs()` — filterable by action/date range, includes the acting user's name
  and role so the frontend doesn't need a separate lookup
- OWNER only, per the PRD's RBAC matrix

### Analytics Module
- `analytics.service.ts` — `getDailySummary()` (total sales, total orders, cash vs UPI
  split, top-5 selling items) and `getHourlySales()` (24-hour order/revenue distribution
  for staffing decisions)
- Fully read-only, no writes — lowest-risk module in the backend
- OWNER only

### Public-Menu Module (customer-facing, no authentication)
- `public-menu.service.ts` — the backend for QR-code ordering. No JWT anywhere in this
  module; outlet is resolved from the URL's `slug` (e.g. `/order/test-cafe-indore`)
  instead of from a token
- `getPublicMenu()` — only returns `isAvailable: true` categories/products
- `createPublicOrder()` — **reuses `orders.service.ts`'s `createOrder()` directly**
  rather than duplicating the price-calculation/order-number logic; `cashierId` is
  passed as `null` to mark it as a customer-placed order
- `getPublicOrderStatus()` — lets the customer poll their order's live status, scoped to
  the outlet so one outlet's order ID can't be queried against another outlet's slug

---

## 2. Bug Found & Fixed Today — Analytics Timezone Bug

**Symptom:** `daily-summary` returned `date: "2026-08-30"` and `totalOrders: 0` even
though an order had just been placed on `2026-08-31`.

**Root cause:** `getDayRange()` used `date.setHours(0,0,0,0)`, which computes midnight in
the **server's local timezone**, not UTC. The database stores all timestamps in UTC. When
the server's local time and UTC diverge, "start of day" boundaries don't line up with the
data, silently returning the wrong day's data — no crash, no error, just quietly wrong
numbers. This is exactly the class of bug that's dangerous precisely because it doesn't
announce itself.

**Fix:** Rewrote `getDayRange()` to build boundaries with `Date.UTC(...)` instead of local
`setHours()`, so day boundaries are always computed in UTC regardless of what timezone the
server itself runs in — verified with a rebuilt test (order at 11:34 UTC on Aug 31
correctly showed up under `date: "2026-08-31"`, hour 17 in the hourly breakdown, which is
correct for IST display since 11:34 UTC = 17:04 IST).

---

## 3. Testing Results — Today's 6 Modules (11+ endpoints)

| Module | Tests | Result |
|---|---|---|
| Inventory | create, list w/ isLowStock flags, low-stock filter, quantity ADD | ✅ All pass |
| Tables | create, list, status update | ✅ All pass |
| Organization | get outlet, update outlet (address + GST) | ✅ All pass |
| Audit | list logs (verified the earlier CANCEL_ORDER entry shows correctly) | ✅ Pass |
| Analytics | daily-summary, hourly-sales | ✅ Pass (after timezone fix) |
| Public-menu | get menu (no auth), place order (no auth, `cashierId: null` confirmed), get order status (no auth) | ✅ All pass |

**Every single backend module built across Days 1–4 has now been built AND manually
tested against a live database. Nothing has been left unverified.**

---

## 4. Full Backend Status — COMPLETE

| Module | Status |
|---|---|
| Monorepo, shared packages, Prisma schema (13 models), Neon DB | ✅ Done |
| Auth (register/login/refresh/staff/me) | ✅ Done & tested |
| Menu (categories/products/variants/addons) | ✅ Done & tested |
| Orders (create/status/item-status/pay/void + Socket.io real-time) | ✅ Done & tested |
| Inventory | ✅ Done & tested |
| Tables | ✅ Done & tested |
| Organization | ✅ Done & tested |
| Audit | ✅ Done & tested |
| Analytics | ✅ Done & tested |
| Public-menu (customer QR, no-auth) | ✅ Done & tested |

**All 8 backend modules are complete. The entire REST API + Socket.io real-time layer for
Cashier, Chef, Admin (Owner/Manager), and the customer QR ordering flow now exists and
works end-to-end against live data on Neon.**

---

## 7. Also Added Today — Email OTP Verification (business requirement)

Since the product will be sold as a paid subscription, unverified emails at signup were
flagged as a real risk (fake/typo accounts, no reliable contact for a paying customer).
Added full email verification to the Auth module:

- **Schema:** `User.emailVerified` (boolean, default false) + new `EmailVerification`
  model (hashed OTP + 10-minute expiry, never stored in plain text)
- **`registerOrganization()` changed:** no longer returns an access token immediately —
  creates the Organization/Outlet/Owner/OTP record atomically in one transaction, then
  sends the OTP by email (outside the transaction, so a network failure doesn't roll back
  the user record — they can just request a resend)
- **New endpoints:** `POST /auth/verify-email` (OTP check → marks verified → issues
  access+refresh tokens, so verifying *is* the login step) and `POST /auth/resend-otp`
- **`login()` changed:** blocks with 403 `"Please verify your email first"` if
  `emailVerified` is false
- **Email delivery:** via Resend (`resend` npm package). Free/sandbox tier can only send
  to the email address the Resend account itself was created with — full open sending
  requires verifying a custom domain at resend.com/domains, which is deferred to closer
  to launch
- Design decision made together: full login block (not partial/banner access) for
  unverified accounts — reasoned to be better UX when verification happens inline during
  signup rather than as a separate friction point later

**Tested end-to-end:** register → OTP delivered to inbox (confirmed via Resend dashboard
logs) → verify-email → tokens issued → login blocked correctly for a second, unverified
account.

**Note:** a temporary `console.log` of the OTP was added during testing (for when Resend's
sandbox restrictions blocked delivery to test addresses) and has been removed before
committing — OTPs must never be logged in a real environment.

---

## 9. Still Genuinely Open (carried forward from earlier logs — not resolved by today's work)

- ⬜ Zero automated tests — everything verified manually via Postman/socket script.
  Still a real gap before this is "launch-ready" rather than "backend-ready."
- ⬜ No load/concurrency testing beyond the single-request order-counter verification —
  real multi-cashier simultaneous load has not been simulated
- ⬜ Security hardening pass not done (CORS is wide open — `origin: true` — for
  development convenience; must be restricted before production)
- ⬜ `packages/config` (shared eslint/tsconfig) — never got built, low priority
- ⬜ Error messages are still developer-facing in places, not yet polished for end users

---

## 10. What's Next — Frontend, Starting Tomorrow

Backend core is done, so focus shifts to `apps/mobile` (Expo — Cashier + Chef + Admin,
role-based navigation) and eventually `apps/web` (customer QR site). Also planned: a
realistic day-by-day frontend timeline (similar to how the backend was scoped
day-by-day) to sanity-check whether the Ganesh Chaturthi (Sept 14, 2026) launch target is
achievable, and what scope needs to be cut if not — this was flagged as a real risk on
Day 3 and hasn't been resolved yet, just deferred to be planned properly before frontend
work starts.