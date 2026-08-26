# Folder Structure:
cafe-pos/
│
├── apps/
│   │
│   ├── backend/                          # Express + TypeScript + Prisma
│   │   ├── src/
│   │   │   ├── modules/                  # Feature-based, har module self-contained
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   └── auth.types.ts
│   │   │   │   ├── organization/         # Org + Outlet management
│   │   │   │   │   ├── organization.controller.ts
│   │   │   │   │   ├── organization.service.ts
│   │   │   │   │   └── organization.routes.ts
│   │   │   │   ├── menu/                 # Categories, Products, Variants, Addons
│   │   │   │   │   ├── menu.controller.ts
│   │   │   │   │   ├── menu.service.ts
│   │   │   │   │   └── menu.routes.ts
│   │   │   │   ├── inventory/            # Stock entries + low-stock alerts
│   │   │   │   │   ├── inventory.controller.ts
│   │   │   │   │   ├── inventory.service.ts
│   │   │   │   │   └── inventory.routes.ts
│   │   │   │   ├── orders/               # Order + OrderItem + billing
│   │   │   │   │   ├── orders.controller.ts
│   │   │   │   │   ├── orders.service.ts
│   │   │   │   │   ├── orders.routes.ts
│   │   │   │   │   └── order-number.service.ts   # daily-reset counter logic
│   │   │   │   ├── tables/               # Table allocation/status
│   │   │   │   │   ├── tables.controller.ts
│   │   │   │   │   ├── tables.service.ts
│   │   │   │   │   └── tables.routes.ts
│   │   │   │   ├── analytics/            # Daily summary, hourly sales
│   │   │   │   │   ├── analytics.controller.ts
│   │   │   │   │   ├── analytics.service.ts
│   │   │   │   │   └── analytics.routes.ts
│   │   │   │   ├── audit/                # AuditLog reads (writes happen inline in services)
│   │   │   │   │   ├── audit.controller.ts
│   │   │   │   │   ├── audit.service.ts
│   │   │   │   │   └── audit.routes.ts
│   │   │   │   └── public-menu/          # Customer-facing QR menu (no auth)
│   │   │   │       ├── public-menu.controller.ts
│   │   │   │       ├── public-menu.service.ts
│   │   │   │       └── public-menu.routes.ts
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts       # verifies JWT access token
│   │   │   │   ├── authorize.ts          # RBAC — role-based route guard
│   │   │   │   ├── validate.ts           # generic Zod validation wrapper
│   │   │   │   ├── error-handler.ts      # global error middleware
│   │   │   │   ├── rate-limiter.ts
│   │   │   │   └── audit-logger.ts       # auto-logs high-risk actions
│   │   │   │
│   │   │   ├── sockets/
│   │   │   │   ├── index.ts              # socket.io server init
│   │   │   │   ├── kds.socket.ts         # KDS room events
│   │   │   │   ├── pos.socket.ts         # cashier/waiter room events
│   │   │   │   └── socket-auth.ts        # JWT check on socket handshake
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── env.ts                # validated env vars (Zod)
│   │   │   │   ├── db.ts                 # Prisma client singleton
│   │   │   │   └── logger.ts             # Winston setup
│   │   │   │
│   │   │   ├── utils/
│   │   │   │   ├── constants.ts          # roles, order statuses, enums mirror
│   │   │   │   ├── api-response.ts       # standard {success,message,data,error}
│   │   │   │   ├── async-handler.ts      # try/catch wrapper for controllers
│   │   │   │   └── password.ts           # bcrypt helpers
│   │   │   │
│   │   │   ├── app.ts                    # express app, middleware mount
│   │   │   └── server.ts                 # http server + socket.io bootstrap
│   │   │
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   │
│   │   ├── .env.example
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── mobile/                            # Expo — Cashier + Chef + Admin (role-based)
│   │   ├── app/                           # Expo Router v3
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── outlet-select.tsx
│   │   │   ├── (cashier)/
│   │   │   │   ├── billing.tsx            # main POS screen
│   │   │   │   ├── checkout.tsx
│   │   │   │   └── cash-reconcile.tsx
│   │   │   ├── (chef)/
│   │   │   │   └── kds.tsx                # live orders board
│   │   │   ├── (admin)/                   # Owner + Manager
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── menu-manage.tsx
│   │   │   │   ├── inventory.tsx
│   │   │   │   ├── staff.tsx
│   │   │   │   └── audit-logs.tsx
│   │   │   ├── _layout.tsx                # root layout + role-based redirect
│   │   │   └── index.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── cashier/                   # ProductGrid, CartRow, VariantModal
│   │   │   ├── chef/                      # OrderCard, DelayTimer
│   │   │   ├── admin/                     # StatCard, InventoryAlertBadge
│   │   │   └── shared/                    # Button, Modal, etc.
│   │   │
│   │   ├── stores/                        # Zustand
│   │   │   ├── auth.store.ts
│   │   │   ├── cart.store.ts
│   │   │   └── socket.store.ts
│   │   │
│   │   ├── services/
│   │   │   ├── api-client.ts              # axios/fetch instance + token refresh
│   │   │   ├── socket-client.ts
│   │   │   └── printer.service.ts         # ESC/POS bluetooth logic
│   │   │
│   │   ├── hooks/                         # useOrders, useMenu (TanStack Query)
│   │   ├── constants/                     # roles, statuses (mirrors backend)
│   │   ├── app.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                               # Customer QR ordering — Next.js
│       ├── app/
│       │   ├── order/
│       │   │   └── [cafeSlug]/
│       │   │       ├── page.tsx           # menu browse + cart
│       │   │       ├── cart.tsx
│       │   │       └── status/
│       │   │           └── [orderId]/
│       │   │               └── page.tsx   # live order status (polling)
│       │   └── layout.tsx
│       ├── components/
│       ├── lib/
│       │   └── api-client.ts
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── shared-types/
│   │   └── src/
│   │       ├── order.types.ts
│   │       ├── user.types.ts
│   │       └── index.ts
│   ├── shared-schemas/                    # Zod — used by backend + mobile forms
│   │   └── src/
│   │       ├── auth.schema.ts
│   │       ├── order.schema.ts
│   │       ├── menu.schema.ts
│   │       └── index.ts
│   └── config/                            # shared eslint + tsconfig base
│       ├── eslint-preset.js
│       └── tsconfig.base.json
│
├── .gitignore
├── pnpm-workspace.yaml
├── turbo.json
└── package.json


# Product Requirements Document (PRD)
**Product Name:** Cafe Management System & POS (Working Title: Cafee-Pos)
**Target Launch Date:** September 14, 2026 (Ganesh Chaturthi)
**Target Audience:** Standalone Cafes, QSRs, Bakeries, Small Cloud Kitchens
**Pricing Strategy:** ₹799 (Basic) / ₹899 (Standard) / ₹999 (Pro) per outlet / month

---

## 1. Executive Summary

An end-to-end, ultra-fast, multi-role Cafe POS and Management System. One mobile app
serves Cashier, Chef, and Admin (Owner/Manager) roles with role-based navigation.
A separate lightweight website handles customer-facing QR code ordering — no app
install required for the end customer. Built for single-tap order creation, real-time
Kitchen Display System (KDS) sync, inventory tracking, and zero-theft owner monitoring.

---

## 2. Product Surfaces

| Surface | Format | Users | Why |
|---|---|---|---|
| Staff App | Mobile app (Expo, role-based nav) | Cashier, Chef, Owner/Manager | Needs Bluetooth thermal printing, offline resilience, and speed — only reliable in a native app. One app, three role-gated navigation groups: `(cashier)`, `(chef)`, `(admin)`. |
| Customer Ordering | Website (mobile-optimized, PWA-style) | Walk-in customers via QR scan | No customer installs an app to order at a single cafe — scan-to-browser is the only viable pattern. |

---

## 3. Roles & Permission Matrix (RBAC)

| Feature / Action | Owner | Manager | Cashier | Chef |
|---|---|---|---|---|
| Full Sales & Revenue Analytics | ✅ | ❌ | ❌ | ❌ |
| Audit Logs & Void Order Reports | ✅ | ❌ | ❌ | ❌ |
| Menu Editing & Pricing Changes | ✅ | ✅ | ❌ | ❌ |
| Add Stock / Inventory Entry | ✅ | ✅ | ❌ | ❌ |
| Fast POS Billing | ✅ | ✅ | ✅ | ❌ |
| Bluetooth Thermal Bill Printing | ✅ | ✅ | ✅ | ❌ |
| Table Allocation & Switch | ✅ | ✅ | ✅ | ❌ |
| KDS Order View & Status Updates | ✅ | ✅ | ❌ | ✅ |
| Mark Order as Served | ✅ | ✅ | ✅ | ✅ |

Note: no dedicated Waiter role in MVP — "mark as served" is available from the KDS
screen itself (Chef or Cashier taps it), avoiding a fifth role/app in v1.

---

## 4. Core Workflows

### 4.1 Order & Kitchen Flow
1. Cashier builds the order in the billing screen and checks out (Cash/UPI — manual entry in MVP).
2. Order is pushed via Socket.io to the Chef's KDS screen in real time.
3. Chef updates item status: `PENDING → PREPARING → READY`.
4. Once marked `READY`, the order appears in a "Ready to Serve" list.
5. Chef or Cashier marks it `SERVED` once delivered to the table/customer.

### 4.2 Inventory Flow
1. Manager logs incoming inventory stock in the app (item + quantity).
2. As orders consume stock, quantity decreases (or is manually adjusted by Manager).
3. When stock for an item drops to/below a set threshold, a **refill alert** appears
   on the Owner's dashboard ("Inventory needs to be filled up").
4. No demand forecasting in MVP — simple threshold-based alerting only.

### 4.3 Customer QR Ordering Flow
1. Each cafe/outlet has a unique QR code linking to its own menu page (`/order/:cafeSlug`).
2. Customer scans → browses cafe-specific menu in browser → adds items to cart → places order.
3. Payment in MVP: **"Pay at Counter"** — no gateway integration yet.
4. Customer sees live order status on the same page (Preparing → Ready), via polling.
5. Order is pushed to the same KDS pipeline as cashier-created orders.

---

## 5. MVP Scope

### In MVP
- Cashier: menu grid, cart, checkout (Cash/UPI manual), send order to KDS
- Chef: live KDS board, status pipeline, mark-as-served
- Manager: inventory add/update, low-stock threshold alert to Owner
- Customer QR page: per-cafe menu, cart, place order, pay-at-counter, live status via polling
- Owner: daily sales summary (total orders, revenue, cash vs UPI split)
- Basic audit log (who cancelled/voided an order)

### Deferred (post-MVP)
- Payment gateway integration (Razorpay/UPI auto-collection)
- WhatsApp auto-messaging for bill/status
- Push notifications (replaced by polling in MVP)
- PIN-based void/discount approval flow
- Advanced zero-theft detection & analytics
- Bluetooth ESC/POS thermal printing (MVP may use browser/digital bill; real thermal printing in Phase 2)
- Multi-outlet consolidated analytics for Owner

---

## 6. Technical Architecture & Tech Stack

```
┌────────────────────────────┐   ┌──────────────────────────┐
│   MOBILE APP (Expo)        │   │  CUSTOMER WEB (Next.js)  │
│ Cashier / Chef / Admin     │   │  QR Menu + Order Status  │
│ role-based navigation      │   │                          │
└──────────────┬──────────────┘   └─────────────┬────────────┘
               │        Socket.io + REST API      │
               └───────────────┬───────────────────┘
                               ▼
                ┌───────────────────────────────┐
                │      EXPRESS.JS BACKEND        │
                │  Auth, Orders, Inventory, Zod  │
                └───────────────┬─────────────────┘
                               │ Prisma ORM
                               ▼
                ┌───────────────────────────────┐
                │     NEON POSTGRESQL DB         │
                │  Serverless, pooled connection │
                └───────────────────────────────┘
```

- **Mobile:** React Native (Expo Router v3), NativeWind, Zustand, TanStack Query
- **Customer Web:** Next.js, mobile-optimized, no auth required
- **Backend:** Node.js, Express.js (TypeScript), Socket.io, Zod validation
- **Database:** Neon.tech Serverless PostgreSQL + Prisma ORM (pooled connection string — required for POS billing latency)
- **Auth:** JWT (15m access token + 7d refresh token in HttpOnly cookie), bcrypt
- **Monorepo:** pnpm workspaces + Turborepo — `apps/{backend,mobile,web}` + `packages/{shared-types,shared-schemas,config}`

---

## 7. Launch Roadmap & Milestones

| Phase | Scope |
|---|---|
| Phase 1 (Week 1) | Monorepo scaffold, shared packages, Prisma schema, DB setup on Neon |
| Phase 2 (Week 2) | Backend modules: auth, menu, orders, inventory, sockets |
| Phase 3 (Week 3) | Mobile app: Cashier billing + Chef KDS + Admin dashboard screens |
| Phase 4 (Week 4) | Customer QR web app + end-to-end integration testing |
| Beta | On-field testing with pilot cafe partners |
| Launch | September 14, 2026 🚩 |

---

## 8. Open Decisions (to revisit before Phase 3)

- Thermal printing: ship MVP with browser-based digital bill, or invest in Bluetooth ESC/POS from day one?
- Inventory threshold: fixed default per item, or Manager sets it per item during stock entry?