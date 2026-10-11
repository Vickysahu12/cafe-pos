# Cafe POS — Build Progress Log
**Date:** October 11, 2026 (Day 13)
**Focus:** Three features from the co-founder brief: **table edit**, **complimentary**, and **delivery from the café's own website** (option A, no Swiggy/Zomato).

Vicky's decisions:
- Delivery = A, from our own link (our brand, no aggregator).
- Complimentary = Owner/Manager only.
- Delivery charge = a default the café sets, which staff can change per order.

---

## 1. Table edit (brief points 1B + 2)
| Piece | What |
|---|---|
| DB | `tables.archivedAt` (soft delete) + `createdAt`/`updatedAt` (migration `20261011100000_table_edit`) |
| API | `PATCH /tables/:id` (rename, seats), `DELETE /tables/:id` (archive). Owner/Manager only. |
| Rules | <ul><li>Name unique per café, case-insensitive (archived names can be reused).</li><li>Name max 20 chars; seats 1–50.</li><li>**A table with a running order can't be deleted:** "Table 1 has a running order (#23)".</li><li>Deleted tables are hidden from the list, billing, the QR menu (its QR opens the menu without a table) and new orders (404).</li><li>Old bills keep the table name.</li><li>`TABLE_DELETED` audit log.</li></ul> |
| Race | <ul><li>Order creation takes `FOR SHARE` on the table and delete takes `FOR UPDATE`, so a delete and a bill on the same table at the same moment can't both win.</li></ul> |
| List | `GET /tables` returns each table's **running orders** (one extra query). |
| App | <ul><li>Tap a table → sheet with status, seats and running orders (tap opens the order).</li><li>**"New bill for T4"** opens Billing with the table set (asks first if the cart holds another table's items).</li><li>Reserve/Free, Edit, Delete. Live refresh on order events.</li></ul> |
| Labels | `tableShort`/`tableTitle`: "5" → T5 / Table 5, "Window 1" stays as typed. The old code would show "TWindow 1". Applied to 8 places (KDS, orders list, QR alert, billing, cart, dashboard, QR screen). |

## 2. Complimentary (brief point 10)
| Piece | What |
|---|---|
| DB | `order_items`: `isComplimentary`, `compValue` (menu price × qty), `compCost` (recipe ingredient ₹), `compReason`, `compById`. `orders.complimentaryValue`. (migration `20261011110000_complimentary`) |
| While billing | Cart line **"Make free"** (Owner/Manager only), reason chips (Guest of owner / Regular / Staff meal / Apology / Promotion / Other) required. Server rejects with 403 from a cashier and **always** from the QR website. |
| After the order | `POST /orders/:id/complimentary {itemIds or "all", reason}`: unpaid orders only (paid → 409 "cancel and re-bill"). Recalculates total + tax on the remaining items. |
| Money | <ul><li>A free line has `totalPrice 0` and adds no tax and no revenue.</li><li>A **whole free bill → ₹0 → automatically PAID** (nothing to collect; checkout skips payment; confirmation says "Complimentary order placed").</li></ul> |
| Stock | Ingredients **still deducted** (the food was made); `compCost` comes from the recipe. |
| Reports | <ul><li>Free items are not "sold" (best sellers, categories, items sold, CSV item sales).</li><li>Avg bill ignores ₹0 bills.</li><li>Food cost % excludes comped ingredients.</li><li>New **Complimentary** card: value, cost, by approver, recent list with reason.</li><li>CSV marks `[free]`.</li></ul> |
| Customer | WhatsApp bill shows "Complimentary" with the price struck through, and the size. |
| Audit | `COMPLIMENTARY` (who, items, value, cost, reason). |

## 3. Delivery from our own website (option A)
| Piece | What |
|---|---|
| DB | <ul><li>`outlets`: `deliveryEnabled`, `deliveryCharge`, `deliveryMinOrder`, `deliveryArea`.</li><li>`orders`: `deliveryAddress`, `deliveryCharge`, `deliveryStatus` (PLACED / OUT_FOR_DELIVERY / DELIVERED).</li><li>Migration `20261011120000_delivery`.</li></ul> |
| Owner | Settings → **Delivery orders** (also a More tile): on/off, default charge, minimum order, area text, **ordering link + Share**. Owner only. |
| Website | <ul><li>When delivery is on (and the customer didn't come from a table QR): **Takeaway / Delivery** switch.</li><li>Delivery requires phone + address (remembered in the customer's browser only).</li><li>The bill shows the delivery row; below the minimum the button is disabled with "Add ₹X more".</li><li>"Pay on delivery".</li><li>Settings fetched fresh, so turning it off takes effect at once.</li></ul> |
| Server rules | <ul><li>Delivery only when enabled.</li><li>Address 10–300 chars.</li><li>**Charge and minimum always come from the café setting** (the client can't set them).</li><li>Takeaway orders never store an address.</li></ul> |
| Staff | <ul><li>The order rings like a QR order ("New delivery order #23").</li><li>**Delivery** filter in Orders.</li><li>The order screen has an address card + **Open in Maps**.</li><li>Delivery charge: the pencil lets Owner/Manager change it on unpaid orders (audit `DELIVERY_CHARGE_CHANGE`).</li><li>**Out for delivery → Mark delivered** replaces "Mark as served" (delivered = served; can't go back a step).</li></ul> |
| Privacy | The address is treated like the phone: **never sent to the kitchen**, never in CSV, never echoed on the customer status page, **deleted after 30 days** by the retention job. |
| Customer | Status page: "Out for delivery" / "Delivered" steps + delivery row. Bill shows the delivery charge. |

### Real bug found and fixed
`payOrder` recalculated the bill as items + tax, so **a delivery charge would have vanished at payment**. It now includes `deliveryCharge`. Complimentary recalculation keeps it too.

## Verification
- `tsc` passes for backend, web and mobile; `next build` OK; Android bundle OK.
- Migrations applied to dev; **`prisma migrate diff` shows no drift** between the DB and the schema.
- **`scripts/smoke-features.ts`: 73/73** (new). It covers:
  - Tables: roles, duplicates, limits, cross-café, running-order block, soft delete, QR of a deleted table, reuse, audit.
  - Complimentary: roles (cashier / QR blocked), reason required, exact totals/tax, stock + cost, auto-paid ₹0, comp after order, paid → 409, reports (value ₹700, cost ₹36, revenue, avg bill, not "sold"), customer bill.
  - Delivery: off → blocked, settings roles, min order, address/phone required, server charge (₹430), kitchen sees no address, charge change + audit, status steps, **payment keeps the charge (₹450)**, status page, bill, takeaway stores no address, CSV, retention.
- Regressions: **smoke-security 140/140, smoke-stock 92/92**.

## To ship
Push. Render applies the 3 migrations. Build a new APK (many new screens). The website auto-deploys on Vercel.
