# CLAUDE.md

Cafe POS ("BillRaw", working title Cafee-Pos) — multi-role point-of-sale SaaS for Indian cafes, QSRs and bakeries, sold per outlet per month. Product spec: [PRD.md](PRD.md). Legal drafts and the Play Store checklist live one level up in `../docs/`.

## Surfaces

| App | Stack | Who uses it |
|---|---|---|
| `apps/backend` | Express 4 + TypeScript, Prisma 5 (Neon Postgres), Socket.io 4, Zod 3, Resend (email OTP) | Everything talks to this |
| `apps/mobile` | Expo SDK 57, Expo Router, Zustand, axios, socket.io-client, expo-secure-store | Staff: Owner / Manager / Cashier / Chef, one app, role-gated route groups |
| `apps/web` | Next.js 16 (App Router), Tailwind 4, Zustand | Customers scanning a table QR — `/order/[slug]`, no login |
| `packages/shared-schemas` | Zod request schemas, used by backend `validate()` | |
| `packages/shared-types` | Plain TS types (JWT payload, socket event shapes) | |

**Before touching mobile or web, read that app's `AGENTS.md`**: Expo 57 and Next 16 both have breaking changes relative to older docs. Use the versioned docs they point to, not memory.

## Commands

pnpm workspaces + Turborepo. Run from the repo root:

```bash
pnpm dev:backend        # tsx watch src/server.ts
pnpm dev:mobile         # expo start
pnpm dev:web            # next dev
pnpm db:generate        # prisma generate
pnpm db:migrate         # prisma migrate dev (creates a migration — needs DIRECT_URL)
pnpm --filter backend exec tsc --noEmit   # backend type-check
pnpm --filter web lint
pnpm turbo run build --filter=backend     # builds shared packages → backend (prisma generate + tsc)
pnpm --filter backend db:deploy           # prisma migrate deploy (production)
```

`packages/shared-*` compile to `dist/` (CommonJS) and the backend runs them from there. **`pnpm dev:backend` builds them first via turbo, but if you run `tsx`/`node` directly after editing a shared schema, rebuild the packages first.** Types resolve from `src/`, so editors don't need a build.

**Tests:** there is no unit-test suite yet. [apps/backend/scripts/smoke-security.ts](apps/backend/scripts/smoke-security.ts) is an end-to-end security smoke test against a running server and a **dev** DB. It creates two throwaway cafes, tries the cross-outlet/void/discount attacks, and cleans up after itself. Run it after touching orders, menu, auth or public-menu (instructions are in the file header).

## Environment

Backend env is validated at boot in [apps/backend/src/config/env.ts](apps/backend/src/config/env.ts). The process exits if anything is missing. Required: `DATABASE_URL` (pooled), `DIRECT_URL` (migrations), `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (≥32 chars each; the refresh secret is also the HMAC key for stored refresh tokens, so rotating it logs everyone out), `RESEND_API_KEY`, `EMAIL_FROM`, `ALLOWED_ORIGINS` (comma-separated browser origins; native mobile sends no Origin header and is always allowed).

- Mobile reads `EXPO_PUBLIC_API_URL` (from `apps/mobile/.env.local` in dev, from the EAS build env in release). Release builds refuse to start without it, or if it isn't `https://`. See [apps/mobile/lib/config.ts](apps/mobile/lib/config.ts).
- Web reads `NEXT_PUBLIC_API_BASE_URL`.
- The full reference is [apps/backend/.env.example](apps/backend/.env.example).

## Backend architecture

`src/modules/<feature>/` each have `*.routes.ts` → `*.controller.ts` → `*.service.ts`:
- **routes** own the middleware chain: `authenticate → authorize(...roles) → validate(Schema) → controller`.
- **controllers** are thin, wrapped in `asyncHandler`, and are the *only* place that emits Socket.io events (`getIO()`).
- **services** hold Prisma logic and know nothing about req/res.

Modules: `auth`, `organization`, `menu`, `orders`, `tables`, `inventory`, `audit`, `analytics`, `public-menu` (unauthenticated customer QR API under `/api/v1/public/:slug/...`).

### Rules that keep tenants isolated — follow them in every new endpoint
- **`outletId` always comes from the JWT (`req.user.outletId`), never from the request body.** Schemas that contain `outletId` are mounted with `.omit({ outletId: true })`.
- **Look up by `{ id, outletId }` before any update or delete** (`findFirst`), then update by id. Any *child* id (order item, variant, addon, table referenced by an order) must also be checked against its parent or outlet.
- **Never pass `req.body` straight into Prisma `data`.** Always validate with a Zod schema and pick fields explicitly.
- **Prices are recomputed server-side** from Product/Variant/Addon rows in `orders.service.createOrder`. Never trust client prices.
- Public routes resolve the outlet from `slug` and must never accept an outletId.

### Conventions
- Response envelope everywhere: `{ success, message, data, error }` via `sendSuccess` / `sendError` ([utils/api-response.ts](apps/backend/src/utils/api-response.ts)).
- Throw errors as `Error` with `statusCode` and optional `code` (e.g. `EMAIL_NOT_VERIFIED`). The global error handler forwards `code` and `userId` to the client. Mobile branches on `code` via `getErrorCode()`.
- High-risk staff actions write an `AuditLog` row. The Owner's audit screen only shows actions listed in `REPORTABLE_ACTIONS` ([audit.service.ts](apps/backend/src/modules/audit/audit.service.ts)), so add new action names there too. `CONSENT_ACCEPTED` is a compliance record and is deliberately hidden.
- "Business day" is always IST — use [utils/date.ts](apps/backend/src/utils/date.ts) helpers, never `setHours` or local time.
- Order numbers reset daily per outlet via the `OrderCounter` upsert. It must be called inside the same transaction that creates the order.
- Table `OCCUPIED`/`AVAILABLE` is derived from active orders by `syncTableStatus`. Call it after any order status or payment change.
- Money is stored as Prisma `Float` (known limitation). Wrap every money calculation in `round2()` from [utils/money.ts](apps/backend/src/utils/money.ts) until the Decimal migration lands.
- **Order lifecycle rules** (orders.service.ts):
  - Cancel happens only via `POST /orders/:id/void` (Owner/Manager, audited); `/status` does not accept `CANCELLED`.
  - Cancelled orders are frozen.
  - A PAID order can't be paid again.
  - Discount ≤ bill, and every discount writes `APPLY_DISCOUNT`.
  - Voiding a PAID order sets `REFUNDED`.
  - Pay and void run in a transaction with a conditional `updateMany`, which protects against races.
- Write audit logs inside the same transaction as the action: `logAuditAction(params, tx)`.
- List endpoints are capped (orders 200 default / 500 max, audit 300). Never return an outlet's all-time history unbounded.
- Emails are stored lowercase, and lookups use `mode: "insensitive"`.
- The error handler hides 5xx messages in production. Set `err.expose = true` on a deliberate 5xx whose message is safe for users.
- Code comments are written in Hinglish in a `USE CASE / CONNECTED TO` header style. Mark every fix with `// FIX (YYYY-MM-DD): <why>` at the change site. Match it.
- Daily progress logs live in `apps/backend/src/docs/progressN.md`.

### Auth model
- Access token: JWT, 15 min, payload `{ userId, role, outletId, organizationId }`.
- Refresh token: opaque random string, 30 days, stored as an HMAC hash in `refresh_tokens`, sent in the request **body** (no cookies). Not rotated on refresh. Revoked on logout and on staff deactivation.
- The Owner self-registers and must verify an email OTP (hashed, 5 attempts, 60 s resend cooldown, max 5 per hour). Staff are created by Owner/Manager and are pre-verified.
- Roles: `OWNER`, `MANAGER`, `CASHIER`, `CHEF`. Only the Owner can create or deactivate Managers. Analytics and audit are Owner-only.

### Real-time
Socket handshake verifies the JWT and checks `isActive` ([sockets/socket-auth.ts](apps/backend/src/sockets/socket-auth.ts)). On connect the socket joins `outlet_<id>_kds` (CHEF/OWNER/MANAGER) and/or `outlet_<id>_pos` (CASHIER/OWNER/MANAGER). Events: `order:created`, `order:updated`, `order:item_updated` (kds), `order:item_ready` (pos). Customers on the web poll `GET /public/:slug/orders/:orderId` instead of using sockets.

## Mobile architecture
- `app/(auth) | (cashier) | (chef) | (admin)` route groups. [app/index.tsx](apps/mobile/app/index.tsx) redirects by role; [app/_layout.tsx](apps/mobile/app/_layout.tsx) is the global auth guard.
- `features/<name>/<name>.api.ts` hold typed calls through the single `apiClient` ([lib/api-client.ts](apps/mobile/lib/api-client.ts)). It attaches the bearer token and does a single-flight refresh on 401.
- Tokens live in `expo-secure-store` ([lib/storage.ts](apps/mobile/lib/storage.ts)). Auth state is in `features/auth/auth.store.ts`.
- `features/orders/useActiveOrders.ts` is the shared live-orders hook. Don't wire separate socket listeners per screen. Refetch on every socket (re)connect, because events are lost while disconnected.
- Token refresh is single-flight: `refreshAccessToken()` in `lib/api-client.ts`, shared by REST and the socket. The socket's `auth` is a function, so each reconnect reads the latest token.
- A network error must never log the user out. Only a server-rejected refresh does, via `setOnSessionExpired`. The user profile is cached in SecureStore for offline start.
- UI primitives are in `components/ui`; design tokens are in `theme/`.

## Web architecture
- `app/order/[slug]/` holds the menu, `cart/`, `checkout/` and `status/[orderId]/` pages. All are client components calling `lib/api.ts`.
- The cart is a persisted Zustand store (`localStorage` key `billraw-cart`) bound to one outlet slug. Every `/order/[slug]` page must call `useBindCartToOutlet(slug)`. Customer orders are currently always `TAKEAWAY` with no table.

## Launch status
Backend modules are built, and the pre-launch security pass was done on 2026-09-29 (see `apps/backend/src/docs/progress5.md`).

Also done on 2026-09-29: password reset, change password, staff password reset, account deletion, and product/category edit & delete.

Menu deletes are soft: products and categories get `archivedAt` when old orders reference them. **Every menu/order/public query must filter `archivedAt: null`.**

Done on 2026-09-30:
- staff first-login consent (`POST /auth/consent`, mobile `app/consent.tsx`)
- mobile Cancel Order
- `render.yaml`, `apps/mobile/eas.json`, `.github/workflows/ci.yml`
- The domain is **billraw.in** (API at `api.billraw.in`, QR site at `order.billraw.in`, email from `no-reply@billraw.in` via Resend, verified).

Launch coding is complete.

Deferred until after launch: Float → Decimal, unit tests, subscription billing.
- subscription billing — deliberately deferred; the first ~100 clients pay manually
- thermal printing
- inventory auto-deduction

Consult the latest progress doc before claiming anything is production-ready.
