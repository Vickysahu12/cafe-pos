# Cafe POS — Build Progress Log
**Date:** August 27, 2026 (Day 2)
**Status:** Auth + Menu modules complete and tested. Orders module (most complex) is next.

---

## 1. New Standing Convention (started today)

From today onward, **every backend file gets header comments** explaining:
1. **USE CASE** — what this file is for
2. **CONNECTED TO** — which other files/modules it talks to

This applies to every new file going forward (service, controller, routes, middleware,
etc.) — see `menu.service.ts` / `menu.controller.ts` / `menu.routes.ts` below for the
pattern to follow in every future module.

---

## 2. What We Built Today — Menu Module ✅ DONE & TESTED

### `modules/menu/menu.service.ts`
- `createCategory()` — creates a category; `outletId` comes from the JWT (`req.user`),
  never from the request body, so one outlet can never write into another outlet's data
- `getCategories()` — lists categories for an outlet, with product count
- `updateCategory()` — updates a category, but first verifies it belongs to the caller's
  outlet (multi-tenant isolation check)
- `createProduct()` — creates a product with **nested variants and addons in one call**
  (Prisma nested `create`), and verifies the category belongs to the caller's outlet
  before allowing the product to be linked to it
- `getProducts()` — lists products with filters: `categoryId`, `search` (name, case-
  insensitive), `isAvailable`
- `toggleProductAvailability()` — quick out-of-stock toggle (per the PRD's "Quick toggle"
  feature), also outlet-scoped

### `modules/menu/menu.controller.ts`
- HTTP layer: pulls `req.body` / `req.query` / `req.user`, calls the service, returns the
  standard `{success,message,data,error}` response via `sendSuccess()`
- Contains all 6 handlers: `createCategory`, `getCategories`, `updateCategory`,
  `createProduct`, `getProducts`, `toggleAvailability`

### `modules/menu/menu.routes.ts`
- All routes require `authenticate` (any logged-in staff member)
- **Reads** (`GET /categories`, `GET /products`) — open to all roles (Cashier needs it for
  billing, Chef needs it for KDS product names)
- **Writes** (`POST /categories`, `PATCH /categories/:id`, `POST /products`,
  `PATCH /products/:id/toggle-availability`) — restricted to `authorize("OWNER","MANAGER")`,
  matching the RBAC matrix in the PRD
- Mounted in `app.ts` at `/api/v1/menu`

### Mounted into `app.ts`
```typescript
import menuRoutes from "./modules/menu/menu.routes";
app.use("/api/v1/menu", menuRoutes);
```

---

## 3. Issue Hit Today & Fix

| Issue | Fix |
|---|---|
| `req.params.id` typed as `string \| string[]`, TypeScript error in controller | Cast to `req.params.id as string` — route params for a single `:id` segment are always a single string in practice |
| `POST /categories` and `POST /products` returned `"outletId": ["Required"]` validation error | The shared Zod schemas (`CreateCategorySchema`, `CreateProductSchema`) include `outletId` as a field for generic reuse (e.g. mobile forms), but the backend route deliberately takes `outletId` from the JWT, not the body. Fixed by validating with `.omit({ outletId: true })` on those two routes. |

---

## 4. Testing Results — Menu Module

| Endpoint | Result |
|---|---|
| `POST /api/v1/menu/categories` | ✅ Pass — created "Beverages" |
| `POST /api/v1/menu/products` | ✅ Pass — created "Cold Coffee" with 2 nested variants (Regular, Large) and 1 addon (Extra Ice Cream) |
| `GET /api/v1/menu/categories` | ✅ Pass |
| `GET /api/v1/menu/products` | ✅ Pass |
| `PATCH /api/v1/menu/products/:id/toggle-availability` | ✅ Pass |

**Menu Module is fully working end-to-end.**

---

## 5. Full Status So Far (Auth + Menu)

| Module | Status |
|---|---|
| Monorepo scaffold (pnpm + Turborepo) | ✅ Done |
| `packages/shared-types`, `shared-schemas` | ✅ Done |
| Prisma schema (13 models) + Neon DB migration | ✅ Done |
| Utils, middleware, config (backend core) | ✅ Done |
| **Auth module** (register/login/refresh/staff/me) | ✅ Done & tested |
| **Menu module** (categories/products/variants/addons) | ✅ Done & tested |
| GitHub repo (private, `.env` safely excluded) | ✅ Done |

---

## 6. What's Pending

### Backend modules not yet built
- ⬜ `middleware/audit-logger.ts` (auto-logs high-risk actions — needed before Orders'
  void/discount actions, since those must be audit-logged)
- ⬜ **Orders module** (tomorrow's focus — see Section 7 below)
- ⬜ Inventory module (stock entries + low-stock alert to Owner)
- ⬜ Tables module
- ⬜ Analytics module (daily summary, hourly sales)
- ⬜ Audit module (reading logs)
- ⬜ Public-menu module (customer QR — no-auth menu + order placement)
- ⬜ Socket.io real-time layer (KDS room, Cashier/POS room)
- ⬜ `packages/config` (shared eslint/tsconfig) — not started

### Other apps
- ⬜ `apps/mobile` — not started
- ⬜ `apps/web` — not started

### Later phases
- ⬜ Security hardening pass
- ⬜ Testing (unit + integration)
- ⬜ Deployment & CI/CD

---

## 7. Tomorrow's Plan — Orders Module (the complex one)

This is the biggest module because it ties together almost everything built so far
(Auth for roles, Menu for products) plus new pieces:

1. **`order-number.service.ts`** — the daily-reset order counter logic, using the
   `OrderCounter` table (Postgres has no native per-day-resetting sequence, so this needs
   a transaction-safe increment: read-or-create today's counter row for the outlet, then
   atomically increment it)
2. **`orders.service.ts`** — create order (with items, variants, addons, tax/discount
   calculation), update order/item status, complete payment, void/cancel order
   (audit-logged)
3. **Socket.io wiring** (`sockets/index.ts`, `sockets/kds.socket.ts`, `sockets/pos.socket.ts`,
   `sockets/socket-auth.ts`) — attaching to `server.ts`, room-per-outlet pattern
   (`outlet_{outletId}_kds`, `outlet_{outletId}_pos`), emitting `order:created`,
   `order:updated`, `order:item_ready`
4. **`orders.controller.ts` + `orders.routes.ts`** — wiring it all to HTTP endpoints
5. **Testing** — create an order as Cashier, verify it appears (via a Socket.io test
   client or by polling) as if a Chef were watching the KDS

Same convention continues: every new file gets USE CASE + CONNECTED TO comments at the top.