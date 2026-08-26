# Cafe POS — Build Progress Log
**Date:** August 26–27, 2026 (Day 1)
**Status:** Auth module backend built, server running, testing in progress

---

## 1. What We Decided (Product/Architecture)

- **Surfaces:** One mobile app (Expo) for Cashier + Chef + Admin (Owner/Manager) with
  role-based navigation groups `(cashier)`, `(chef)`, `(admin)`. One website (Next.js)
  for customer QR ordering only — no app install for customers.
- **No separate Waiter role in MVP** — "mark as served" available from KDS screen itself.
- **Monorepo:** pnpm workspaces + Turborepo.
  `apps/{backend, mobile, web}` + `packages/{shared-types, shared-schemas, config}`
- **Stack confirmed:** Node.js/Express (TS), Neon Postgres (serverless, pooled connection),
  Prisma ORM, Socket.io, JWT (access + HttpOnly refresh cookie), Zod, bcryptjs (switched
  from `bcrypt` due to native-binding failure on Windows), Winston logging.
- Full PRD written and saved (`PRD.md`) — covers roles matrix, workflows, MVP scope,
  deferred features, and the launch roadmap.

---

## 1.1 Important Clarification — "Admin" is NOT a separate role/table

"Admin" in the mobile app's `(admin)` route group is a **UI grouping only** — it covers
**both OWNER and MANAGER** roles sharing the same screens (Dashboard, Menu, Inventory,
Staff, Audit Logs). There is **no `ADMIN` role in the database** and no separate `Admin`
table. The actual roles are only: `OWNER`, `MANAGER`, `CASHIER`, `CHEF`.

Within the shared Admin screens, some actions are Owner-only (full analytics, audit logs)
and some are Owner+Manager (menu editing, inventory, staff creation except Manager
accounts) — this is enforced via `authorize("OWNER")` vs `authorize("OWNER","MANAGER")`
per-route, not via a separate role.

---

## 2. Folder Structure — DONE ✅

```
Cafee-Pos/
├── apps/
│   ├── backend/        ✅ scaffolded + built today (see below)
│   ├── mobile/          ⬜ folder created, empty — not started
│   └── web/              ⬜ folder created, empty — not started
├── packages/
│   ├── shared-types/    ✅ done
│   ├── shared-schemas/   ✅ done
│   └── config/            ⬜ folder created, empty — not started
├── .gitignore            ✅ filled
├── pnpm-workspace.yaml    ✅ done
├── turbo.json              ✅ done
└── package.json             ✅ done (root)
```

---

## 3. `packages/shared-schemas` — DONE ✅

Zod validation schemas, shared between backend and (later) mobile forms.

- `auth.schema.ts` — `RegisterOrganizationSchema`, `LoginSchema`, `CreateStaffSchema`
- `order.schema.ts` — `OrderItemSchema`, `CreateOrderSchema`, `UpdateOrderStatusSchema`,
  `PayOrderSchema`, `VoidOrderSchema`
- `menu.schema.ts` — `CreateCategorySchema`, `ProductVariantSchema`, `ProductAddonSchema`,
  `CreateProductSchema`, `ToggleAvailabilitySchema`
- `index.ts` — re-exports everything

## 4. `packages/shared-types` — DONE ✅

Plain TypeScript types (no runtime validation) — enums mirror, API shapes, socket payloads.

- `user.types.ts` — `UserRole`, `AuthUser`, `AccessTokenPayload`
- `order.types.ts` — order/payment enums, `OrderWithItems`, `OrderItemDetail`,
  `OrderCreatedEvent`, `OrderItemReadyEvent`
- `index.ts` — re-exports everything

---

## 5. Backend (`apps/backend`) — IN PROGRESS 🟡

### 5.1 Setup files — DONE ✅
- `package.json` — all dependencies (Express, Prisma, Socket.io, JWT, Zod, Winston, etc.)
  - **Note:** `bcrypt` was replaced with `bcryptjs` (native binding failed on Windows)
- `tsconfig.json` — `module: "Node16"`, `moduleResolution: "node16"` (fixed from
  deprecated `"node"` setting)
- `.env` — `DATABASE_URL`, `DIRECT_URL` (Neon pooled + direct), `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET` (locally generated via `crypto.randomBytes`), `PORT=3000`,
  `NODE_ENV=development`

### 5.2 Database — DONE ✅
- **Neon project created:** `cafe-pos`, branch `production`, region `ap-southeast-1`
  (Singapore)
- **`schema.prisma` written** — all 13 models:
  `Organization`, `Outlet` (with `slug` for QR URLs), `User`, `Category`, `Product`,
  `ProductVariant`, `ProductAddon`, `Table`, `Order`, `OrderItem`, `OrderCounter`
  (solves daily-reset order numbering — Postgres has no native support for this),
  `InventoryItem` (new — for the inventory/low-stock-alert flow), `AuditLog`
- **Migration applied:** `20260826195310_init` — ran successfully, all tables live on Neon
- **Prisma Client generated** successfully

### 5.3 Utils — DONE ✅
- `utils/api-response.ts` — `sendSuccess()` / `sendError()`, standard `{success,message,data,error}` shape
- `utils/async-handler.ts` — wraps async controllers so errors reach the error handler
- `utils/password.ts` — `hashPassword()` / `comparePassword()` (via bcryptjs)
- `utils/constants.ts` — `ROLES`, token expiry constants, cookie name

### 5.4 Middleware — DONE ✅
- `middleware/authenticate.ts` — verifies JWT access token, attaches `req.user`
- `middleware/authorize.ts` — RBAC route guard, `authorize("OWNER","MANAGER")` style
- `middleware/error-handler.ts` — global error catcher, logs via Winston
- `middleware/validate.ts` — generic Zod body validator
- `middleware/rate-limiter.ts` — general limiter (100/15min) + stricter `authRateLimiter`
  (10/15min) applied only to `/login`
- `middleware/audit-logger.ts` — **NOT YET BUILT** ⬜

### 5.5 Config — DONE ✅
- `config/env.ts` — validates all env vars with Zod at startup, crashes early if missing
- `config/db.ts` — Prisma Client singleton (hot-reload safe)
- `config/logger.ts` — Winston setup

### 5.6 Auth Module — DONE ✅ (fully implemented, testing in progress)
- `modules/auth/auth.service.ts`:
  - `registerOrganization()` — creates Organization + Outlet + Owner atomically in a
    `$transaction`; auto-generates a unique `slug` for the outlet (for QR URLs)
  - `login()` — validates credentials, issues access + refresh tokens
  - `refreshAccessToken()` — verifies refresh token, issues new access token
  - `createStaff()` — Owner/Manager creates Cashier/Chef/Manager accounts; **business
    rule added:** only an Owner can create a Manager (not another Manager)
- `modules/auth/auth.controller.ts` — `register`, `login`, `refresh`, `createStaff`, `getMe`
  — refresh token set as HttpOnly cookie, access token returned in response body
- `modules/auth/auth.routes.ts`:
  - `POST /register` (public)
  - `POST /login` (public, rate-limited)
  - `POST /refresh` (public, reads cookie)
  - `POST /staff` (authenticate + authorize OWNER/MANAGER)
  - `GET /me` (authenticate)
- `modules/auth/auth.types.ts` — `RefreshTokenPayload`, `AuthResult` (internal-only types)

### 5.7 App bootstrap — DONE ✅
- `src/app.ts` — Express app: helmet, cors (credentials:true for cookie support),
  json parser, cookie-parser, morgan logging, rate limiter, `/health` route, auth
  routes mounted at `/api/v1/auth`, 404 handler, global error handler
- `src/server.ts` — validates env, starts HTTP server
  - **Socket.io NOT yet attached** — planned for Orders module phase

### 5.8 Server Status — WORKING ✅
- Server runs successfully: `pnpm dev:backend` → `🚀 Server running on http://localhost:3000`
- `GET /health` tested and confirmed working:
  `{"success":true,"message":"Server is healthy","data":null,"error":null}`
- `POST /api/v1/auth/register` — **test in progress**, result not yet confirmed

---

## 6. Issues Hit Today & How We Fixed Them (for reference)

| Issue | Fix |
|---|---|
| Turbo `pipeline` key not recognized | Turbo v2 renamed it to `tasks` in `turbo.json` |
| `pnpm` not recognized | Installed via `npm install -g pnpm`, restarted terminal |
| Terminal window closing before showing output | Used VS Code integrated terminal instead of external PowerShell window |
| `prisma generate` seemed to "hang" | It wasn't hanging — just slow; let it finish, don't touch the window |
| `bcrypt` native module error (`Cannot find module ...bcrypt_lib.node`) | Replaced `bcrypt` with `bcryptjs` (pure JS, no native compilation) — only the import line changed, API is identical |
| `moduleResolution: "node"` deprecated warning | Changed to `"node16"`, which then required `"module": "Node16"` too |
| Root `package.json` had capital letters in `name` and `"type": "module"` | Renamed to `cafe-pos-monorepo`, added `"private": true`, removed `"type": "module"` |

---

## 7. What's Pending (Not Started Yet)

### Immediate next (finish testing today/tomorrow)
- ⬜ Confirm `POST /api/v1/auth/register` creates a real Owner + Outlet + Organization in Neon
- ⬜ Test `POST /api/v1/auth/login`
- ⬜ Test `POST /api/v1/auth/staff` (create a Cashier/Chef under the Owner)
- ⬜ Test `GET /api/v1/auth/me`
- ⬜ Test `POST /api/v1/auth/refresh`

### Backend modules not yet built
- ⬜ `middleware/audit-logger.ts` (auto-logs high-risk actions)
- ⬜ Organization/Outlet module
- ⬜ Menu module (categories, products, variants, addons)
- ⬜ Inventory module (stock entries + low-stock alert to Owner)
- ⬜ Orders module (order creation, order-number counter logic, status pipeline, checkout)
- ⬜ Tables module
- ⬜ Analytics module (daily summary, hourly sales)
- ⬜ Audit module (reading logs)
- ⬜ Public-menu module (customer QR — no-auth menu + order placement)
- ⬜ Socket.io real-time layer (KDS room, Cashier/POS room)

### Other apps
- ⬜ `apps/mobile` — not started (Cashier/Chef/Admin role-based Expo app)
- ⬜ `apps/web` — not started (customer QR ordering site)
- ⬜ `packages/config` — not started (shared eslint/tsconfig)

### Later phases
- ⬜ Security hardening pass
- ⬜ Testing (unit + integration)
- ⬜ Deployment & CI/CD

---

## 8. How to Resume Tomorrow

1. Finish testing the Auth module endpoints listed in Section 7 (register → login → staff
   → me → refresh), using the Owner account created today.
2. Once Auth is confirmed fully working end-to-end, move to the **Menu module**
   (categories + products + variants + addons) — same pattern as Auth
   (service → controller → routes → wire into `app.ts`).
3. After Menu, build the **Orders module** — this is the most complex one (order-number
   daily-reset counter logic, Socket.io wiring for KDS/Cashier sync).
4. Everything is being built module-by-module, backend-first, before touching the mobile
   or web apps — don't jump ahead to mobile/web until backend core (auth, menu, orders,
   inventory) is done and tested.