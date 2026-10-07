# Cafe POS — Build Progress Log
**Date:** October 6, 2026 (Day 10)
**Focus:** Customer name + mobile on QR orders ("whose order is #23?", "the customer left the table"), with privacy done properly.

Every change carries an `ADDED/FIX/UPDATED (2026-10-06)` comment.

---

## 1. The gap (Vicky found it)

- **40 tables at once:** this already worked (table number on every order).
- **Customer stepped away from the table:** there was no way to reach them.
- **Takeaway QR orders:** only "#23" was shown, and in a rush nobody knew whose order it was.
- **Cloud kitchen / delivery:** not supported. **Deferred** (see §6).

## 2. What was built

**Customer (QR site, cart page → "Your details"):**
- **Name:** always required. Letters only (any language), max 40, so HTML/links can't reach the kitchen screen.
- **Mobile:** **required for takeaway** (no table, so the phone is the only way to identify them), **optional for dine-in**. Shown with a +91 prefix; messy input like `+91 98765-43210` / `098765…` is accepted.
- Microcopy: *"Shared only with the café for this order, never for marketing. Deleted after 30 days."*
- Remembered **in the customer's own browser** (cart store), so regulars don't retype it.
- Takeaway card text: *"We'll call your name at the counter when it's ready."* The tracking page header shows **"Order #23 · Rahul"**.

**Staff app:**
- **KDS card + new-order banner:** `#23 · Rahul` (name only).
- **Orders list:** the name before Table/Takeaway.
- **Order screen:** a **Customer card** (name, +91 number) with a green **📞 Call** button (`tel:` link).
- **Send bill on WhatsApp:** the number is **pre-filled** from the order.

## 3. Privacy design (who sees what)

| | Name | Phone |
|---|---|---|
| Owner / Manager / Cashier | ✅ | ✅ (to call) |
| **Chef / KDS** | ✅ | ❌ **never** |
| Public order status / bill | status shows the name; bill shows neither | ❌ never |
| After 30 days | stays | **deleted automatically** |

How it's enforced:
- `modules/orders/customer-privacy.ts`: `withoutCustomerPhone()`, `forRole()`. Chef REST responses (`GET /orders`, `GET /orders/:id`) have the phone removed.
- **Sockets:** previously `to([kds, pos])` sent the full order to the kitchen. Now the KDS room gets the phone-free copy and the POS room gets the full one.
  - **Gotcha fixed:** Owner/Manager sockets are in **both** rooms, so two emits would double every event (double chime). The KDS emit uses **`.to(kds).except(pos)`**.
  - Applied in `orders.controller.ts` (create, status, void) and `public-menu.controller.ts` (QR create).
- **Retention:** `modules/orders/customer-data-retention.ts` sets `customerPhone = NULL` on orders older than **30 days**. It runs at server start and every 6 h (idempotent, so multiple servers are safe; the timer is `unref()`'d). The order, bill and name stay.
- In-app privacy policy (`components/content.ts`) updated: exact fields, who sees the phone, no marketing, 30-day deletion; the Review Booster private feedback is also disclosed now.

## 4. Files

- **DB:** migration `20261006080049_order_customer_contact`: `orders.customerName`, `orders.customerPhone` (nullable, additive).
- **Shared:** `packages/shared-schemas/src/order.schema.ts`: `normalizeIndianMobile`, `CustomerPhoneSchema` (normalises to 10 digits), `CustomerNameSchema` (`\p{L}` letters, `.'-` and spaces, max 40). Optional on `CreateOrderSchema`.
- **Backend:**
  - `orders.service.ts` saves the fields.
  - `public-menu.service.ts`: name required on QR orders, phone required unless DINE_IN; the status response includes `customerName`.
  - `server.ts` starts the retention job.
- **Web:** `lib/phone.ts` (same rules client-side), `lib/api.ts`, `lib/cart-store.ts` (`customer`), `cart/page.tsx` (the form + validation + scroll to error), status header.
- **Mobile:** `orders.api.ts` types, `KdsOrderCard.tsx`, `kds.tsx` banner, `OrdersListScreen.tsx`, `orders/[id].tsx` (Customer card + Call + bill prefill), `ShareBillSheet.tsx` (`initialPhone`).

## 5. Verification

- shared-schemas build, then `tsc` for backend, web and mobile; web ESLint clean. A quick Zod run: `+91 98765-43210` → `9876543210`, `<script>` → rejected, `12345` / `5876543210` → rejected.
- Smoke test: **ALL CHECKS PASSED** (~110), with **+15 new checks**:
  - no name → 400; takeaway without phone → 400; bad phone → 400; HTML name → 400
  - dine-in without phone → 201
  - **chef socket gets the name but NOT the phone**; **owner gets the event exactly once, with the phone**
  - cashier GET has the phone; chef GET and chef list have no phone
  - public status has the name and no phone; bill has neither
  - **the retention job wipes a 31-day-old phone and keeps the name**
- Existing tests that place QR orders were updated with contact details.
- Visual: the checkout "Your details" form at 390px (takeaway case, remembered details pre-filled).
- Demo data deleted; temp servers killed by PID. An accidental line-ending-only change to `web/lib/money.ts` was reverted.

## 6. Not done (deliberately)

- **Delivery / cloud kitchen** (address, map pin, delivery fee, café confirms by call to stop fake orders): later, when a real cloud-kitchen customer asks. Most live on Swiggy/Zomato, which is a different market.
- **OTP verification of the customer number:** SMS costs money and adds friction; customers have no reason to give a wrong number for their own order.
- **The landing page privacy policy** (billraw.in/privacy) needs the same update: Vicky / Desktop session (text in the chat).

## 7. Next

1. Push → Render runs the migration (additive) → Vercel deploys → new APK.
2. Update the billraw.in privacy page (Desktop session).
3. Next feature: 📸 menu photo → POS (needs an Anthropic API key), then the daily closing report.
