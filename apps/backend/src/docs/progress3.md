# Cafe POS — Build Progress Log
**Date:** August 30, 2026 (Day 3)
**Status:** Auth + Menu + Orders modules all complete and fully tested. Real-time Socket.io
layer confirmed working end-to-end. This is the biggest module in the backend — it's done.

---

## 1. What We Built Today — Orders Module ✅ DONE & FULLY TESTED

### `modules/orders/order-number.service.ts`
- `getNextOrderNumber()` — daily-reset order counter, per outlet, using the `OrderCounter`
  table and Prisma's atomic `upsert` + `{ increment: 1 }` — this is safe under concurrent
  requests because the increment happens at the Postgres row level, not in application code
- Must be called inside the same `$transaction` as order creation, so a failed order never
  leaves a "gap" in the sequence

### `middleware/audit-logger.ts`
- `logAuditAction()` — reusable function (not Express middleware) that writes to the
  `AuditLog` table; called directly from service functions that need audit context (like
  a cancellation reason)
- Fixed a Prisma `Json` typing issue: `metadata` needed to be cast to `Prisma.InputJsonValue`

### `modules/orders/orders.service.ts` — the core business logic
- `createOrder()` — **prices are always recalculated server-side** from the Product/
  Variant/Addon tables; client-submitted prices are never trusted (prevents price
  tampering). Validates product availability, computes tax, ties order-number generation
  and order creation into one transaction.
- `getOrders()` / `getOrderById()` — outlet-scoped reads with filters
- `updateOrderStatus()` — whole-order status (e.g. marking SERVED)
- `updateOrderItemStatus()` — **per-item** status update — this is the actual KDS action
  (Chef moves one item PENDING → PREPARING → READY, not the whole order)
- `payOrder()` — applies discount, locks in final amount, marks PAID
- `voidOrder()` — cancels the order AND writes an AuditLog entry (`CANCEL_ORDER` with
  reason) — this is what delivers the PRD's "Zero-Theft Audit Logs" feature

### Socket.io real-time layer
- `sockets/socket-auth.ts` — verifies JWT on the socket handshake (same trust model as HTTP)
- `sockets/kds.socket.ts` — joins Chef/Owner/Manager into `outlet_{outletId}_kds` room
- `sockets/pos.socket.ts` — joins Cashier/Owner/Manager into `outlet_{outletId}_pos` room
- `sockets/index.ts` — bootstraps Socket.io on the HTTP server, exposes `getIO()` singleton
  getter so controllers can emit events without re-importing `server.ts`
- `server.ts` updated to call `initSocketIO(server)` after creating the HTTP server

### `modules/orders/orders.controller.ts` + `orders.routes.ts`
- Controller emits Socket.io events after each relevant action:
  - `order:created` → KDS room, when a Cashier places an order
  - `order:updated` → POS room, on status change or void
  - `order:item_ready` → POS room, specifically when an item hits READY (this is the
    "Chef marks ready → Cashier/Waiter notified instantly" flow from the product spec)
- Routes wired with RBAC matching the PRD: void restricted to OWNER/MANAGER, item-status
  updates restricted to CHEF (+ OWNER/MANAGER), order creation open to CASHIER (+
  OWNER/MANAGER — Chef cannot create orders)
- Mounted in `app.ts` at `/api/v1/orders`

---

## 2. Testing Results — Orders Module

| Test | Result |
|---|---|
| Create order (server-side price calc) | ✅ Pass — ₹120×2 + 5% tax = ₹252 net, calculated correctly |
| Order-number counter | ✅ Pass — order #1, then order #2 on the next order, same outlet, same day |
| Real-time Socket.io — order created → Chef's KDS socket | ✅ Pass — event received instantly with full order + item data |
| Update order-item status → READY | ✅ Pass |
| Complete payment (`POST /:id/pay`) | ✅ Pass — `paymentStatus: PAID`, `paymentMethod: UPI` |
| Void order (`POST /:id/void`) | ✅ Pass — `orderStatus: CANCELLED` |
| Audit log written on void | ✅ Pass — verified directly in Neon's `audit_logs` table: `action: CANCEL_ORDER` with reason in `metadata` |

**Orders module — the most complex part of the backend — is fully working end-to-end,
including the real-time layer.**

---

## 3. Full Status So Far

| Module | Status |
|---|---|
| Monorepo scaffold, shared packages, Prisma schema, Neon DB | ✅ Done |
| **Auth module** | ✅ Done & tested (5/5 endpoints) |
| **Menu module** | ✅ Done & tested (categories + products + variants/addons) |
| **Orders module** | ✅ Done & tested (create, status, item-status, pay, void, real-time sockets) |
| GitHub repo | ✅ Done (private, `.env` safely excluded) |

---

## 4. Issues Hit Today & Fixes (important — recurring pattern, read this before next session)

### The recurring `bcryptjs` / pnpm issue — ROOT CAUSE FOUND
This came back repeatedly today and cost real time, so documenting it properly:

**Cause:** pnpm v12 introduced a security feature — `onlyBuiltDependencies` / build-script
approval. Packages with native install scripts (originally `bcrypt`, plus `esbuild`,
`prisma`, `@prisma/client`/`@prisma/engines`) need **explicit approval** in
`pnpm-workspace.yaml`, or pnpm silently skips their build steps. Combined with Windows
symlink quirks, this meant **any root-level `pnpm add`/`pnpm install` could silently break
`bcryptjs` in `apps/backend`**, even though `bcryptjs` itself needs no native build (the
breakage was collateral damage from the workspace re-link, not from bcryptjs itself).

**Fix applied:** Added to root `pnpm-workspace.yaml`:
```yaml
onlyBuiltDependencies:
  - "@prisma/client"
  - "@prisma/engines"
  - "prisma"
  - "esbuild"
```
(`bcrypt` removed from consideration entirely — we're on `bcryptjs`, pure JS, no native
build needed.)

**Working pattern going forward:**
- Package needed only by `apps/backend` → install **from inside `apps/backend`**
  (`cd apps/backend && pnpm add <package>`), not from root with `-w`
- Package needed at the workspace root (e.g. `turbo`) → root install is fine, but always
  used `-w` and expect to re-verify `pnpm dev:backend` still starts clean afterward
- If `bcryptjs` ever goes missing again: `cd apps/backend && pnpm add bcryptjs` fixes it
  in one shot — don't nuke `node_modules` for this specific error, it doesn't help

### `socket.io-client` — kept breaking inside the monorepo
Every attempt to install `socket.io-client` at the workspace root triggered the same
pnpm/Windows relinking issue described above.

**Final fix:** moved Socket.io testing **completely outside the monorepo** —
`D:\socket-test\` (a plain folder, `npm init -y` + `npm install socket.io-client`, using
`npm` not `pnpm`). This is a temporary, standalone testing utility, not part of the
production codebase. It fully isolated the test script from the workspace, and it worked
immediately.

### Minor issues
| Issue | Fix |
|---|---|
| `POST /orders` → `"outletId": ["Required"]` | Same root cause as Menu module — `CreateOrderSchema` includes `outletId` for generic reuse, but the route takes it from the JWT. Fixed with `validate(CreateOrderSchema.omit({ outletId: true }))`. |
| `"Product not found in this outlet"` | Not a bug — the test product had been deleted from the DB directly; recreated category + product and it worked immediately. |
| `404 Route not found` on `/pay` | A trailing newline (`%0A`) got pasted into the Postman URL field, encoding into the URL and breaking route matching. Always check the URL field for stray whitespace after pasting. |
| JWT "Invalid or expired token" in socket test | Access tokens expire in 15 minutes — always grab a fresh token right before testing sockets. |

---

## 5. What's Pending

### Backend modules not yet built
- ⬜ Inventory module (stock entries + low-stock alert to Owner)
- ⬜ Tables module
- ⬜ Analytics module (daily summary, hourly sales)
- ⬜ Audit module (an actual read/list endpoint for audit logs — right now they're only
  written, not yet queryable via API)
- ⬜ Public-menu module (customer QR — no-auth menu + order placement)
- ⬜ `packages/config` (shared eslint/tsconfig) — not started

### Other apps
- ⬜ `apps/mobile` — not started
- ⬜ `apps/web` — not started

### Later phases
- ⬜ Security hardening pass
- ⬜ Automated tests (still none — everything has been manually verified via Postman/socket
  script so far; this is a real gap flagged earlier and still open)
- ⬜ Deployment & CI/CD

---

## 6. Next Session's Plan

With Auth, Menu, and Orders all done, the backend's core transactional loop is complete.
Next logical modules (in order of dependency):

1. **Inventory module** — straightforward CRUD + threshold-check logic, reuses the same
   patterns already established (service/controller/routes, outlet-scoping, RBAC)
2. **Tables module** — small, needed before Public-menu (dine-in QR orders need to
   reference a table)
3. **Public-menu module** — customer-facing, no-auth version of the menu + order-creation
   flow already built; this unlocks being able to actually build the QR ordering website
4. **Analytics + Audit-read modules** — can come after, they're read-only aggregations
   over data that already exists

Same conventions continue: USE CASE + CONNECTED TO comments on every file, server-side
price/business-logic trust boundaries, outlet-scoped queries everywhere.