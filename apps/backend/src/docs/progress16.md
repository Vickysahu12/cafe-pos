# Cafe POS — Build Progress Log
**Date:** October 18, 2026 (Day 16)
**Focus:** Feature 1 of 4: **UPI QR with the exact amount** (then the WhatsApp delivery link, menu from a photo, item photos).

Vicky's concern: *"money is involved, user trust breaks very fast."* So every design choice below is about safety first.

---

## How it works
1. **Owner only:** Settings → **UPI payments** → enter UPI ID + the name customers will see → **Save and test**.
2. **₹1 self-test:** the app shows a ₹1 QR. The Owner scans it with their own UPI app, checks the **name shown is theirs**, pays ₹1 to themselves, then taps **"₹1 reached my account, turn it on"**. Until then the QR stays off.
3. **Checkout → UPI:** a real QR with the bill amount already filled in, the café name, and the UPI ID in small text. Button: **"Payment received · Place order"**.
4. **Order screen → Collect payment → UPI:** QR with the **server's exact bill amount** (QR/website orders are paid here).

## Safety rules
| Risk | Protection |
|---|---|
| Wrong UPI ID (money to a stranger) | ₹1 self-test with a name check before the QR turns on |
| Staff puts in their own UPI ID | Backend allows only **OWNER** (`PATCH /organization/outlet/upi`, `POST …/upi/verify`). The general outlet update ignores UPI fields. Audit: `UPI_ID_CHANGED`, `UPI_VERIFIED` (visible in Audit logs) |
| UPI ID changed later | Server resets verification, so the Owner must test again |
| Owner changes or turns off UPI while a cashier's app is open | The QR re-fetches the UPI details every time it's shown |
| Fake screenshot / customer edits the amount | The app **never** marks paid by itself. A yellow note says *"Confirm only after your soundbox or UPI app shows ₹X received. Don't trust a screenshot."* |
| Amount above ₹1,00,000 (UPI limit) or ₹0 | No QR. Falls back to "collect on your café's QR" |
| Special characters in name/note break some UPI apps | Name/note cleaned to letters, digits and spaces |
| Owner doesn't want it | Never set up, so checkout looks exactly like before |

BillRaw never touches the money: the QR is a standard `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` link.

## Files
| Area | Files |
|---|---|
| DB | `outlets.upiId`, `upiName`, `upiVerifiedAt`. Migration `20261018100000_outlet_upi` |
| Backend | `organization.service.ts` (`setUpi`, `verifyUpi`), controller, routes (Owner-only), `audit.service.ts` (2 reportable actions), shared `SetUpiSchema` (UPI ID regex) |
| Mobile | `lib/upi.ts` (link builder), `components/payments/UpiQr.tsx`, `app/(admin)/upi-settings.tsx` (new), `settings.tsx` (row), `checkout.tsx`, `orders/[id].tsx`, `outlet.store.ts` (`upi`), `(cashier)/_layout.tsx` (loads outlet info), `(admin)/_layout.tsx` (route) |

## Verification
- Backend + mobile `tsc --noEmit`: clean · `prisma validate`: valid
- **Not run:** migration on a DB, a real phone scan.

## Phone test
- [ ] Owner → Settings → UPI payments → enter a wrong format ID → error. Enter a real ID → ₹1 QR → scan with GPay → correct name → pay ₹1 → "turn it on" → "UPI QR is on".
- [ ] Cashier login → bill → UPI → QR with the exact amount → scan → the amount is pre-filled and **can't** be confused.
- [ ] QR order → order screen → UPI → QR shows the order's exact total.
- [ ] Owner changes the UPI ID → checkout falls back to "collect on your café's QR" until the ₹1 test is done again.
- [ ] Cashier account can't see "UPI payments" in Settings (Cashier has no Settings screen; the API rejects too).
- [ ] Audit logs show "UPI_ID_CHANGED".

## Known limit
- At **checkout** (walk-in bill) the QR uses the app's estimated total (same GST maths as the server, so it's the same as the "Place order ₹X" the cashier already sees). The order screen uses the server's exact amount.

## Next
2. WhatsApp delivery link → 3. Menu from a photo → 4. Item photos.

---

# Feature 2 of 4: WhatsApp delivery link

**Problem (Vicky):** the cashier was marking deliveries "Delivered", but the cashier doesn't deliver. The person who delivers should confirm it, and the owner should know how much cash each delivery boy is carrying.

## Flow
1. Order ready → order screen → **Send to delivery person** → pick a saved person (or add name + WhatsApp number once), or **I'll deliver it myself** (Solo).
2. WhatsApp opens with: customer name + phone, address, Maps pin, amount to collect (or "Already paid"), and a link `order.billraw.in/d/<token>`. Order becomes **Out for delivery · Raju**; the customer's tracking page says "Out for delivery".
3. At the door the delivery boy opens the link (no app, no login): Call / Exact pin, **Collect ₹230**, optional **Show UPI QR** (café's verified UPI, amount filled), **Cash / UPI**, **Delivered** (with confirm). Also "Customer paid a different amount?" and "Customer not available?".
4. The café's order screen updates **instantly** (socket): delivered by Raju at 7:35 PM, ₹230 cash, or ⚠️ warnings.
5. Dashboard (Owner/Manager): **Cash with delivery people**: "Raju · 6 orders · ₹1,450" → **Got ₹1,450** (audited).

## Safety (all enforced on the server)
| Risk | Protection |
|---|---|
| Link guessed or leaked from the DB | 128-bit random token; only its **sha256 hash** is stored; malformed tokens are rejected before the DB; rate limit 60/10 min per IP |
| Wrong person has the link | **Change person / Resend** creates a new token and the old link dies immediately (404) |
| Old link used later | Expires after **12 h**; cancelled → "Don't deliver, take it back"; delivered → shows only the result, **no customer phone/address** |
| Double tap / two phones | Conditional update: delivered **once**; the second tap just shows "Delivered" |
| Bill changed or paid at the counter while out | The delivery boy sends the amount he saw (`expectedDue`); a mismatch → 409, the page reloads with the new amount. Nothing wrong is recorded |
| Collected less | Order delivered but stays **UNPAID** + ⚠️ "Raju collected ₹100 of ₹130" on the café screen |
| Collected more / no method | Rejected (400) |
| Cross-café | Every staff query is scoped by the JWT `outletId`; another café's order/person/cash → 404/409 |
| Roles | Dispatch + saved list: Owner/Manager/Cashier. Remove person + cash: Owner/Manager. Chef: none |
| Link expired / delivery boy has no phone | The café can still **Mark delivered** (with a confirm explaining when to use it) |
| Cash settle race | Only the orders shown on screen are settled; a new delivery arriving meanwhile stays for next time; settling twice → 409 |

## Files
| Area | Files |
|---|---|
| DB | `delivery_people` table; 11 delivery fields on `orders` (person, link hash/expiry, sent/delivered time, issue, collected, method, cash settled). Migration `20261018110000_delivery_link` |
| Backend | `modules/delivery/` (service, controller, `delivery.routes.ts` staff, `rider.routes.ts` public), `rate-limiter.ts` (`riderRateLimiter`), `app.ts` (mounts `/delivery`, `/rider`), `audit.service.ts` (`DELIVERY_CASH_RECEIVED`), shared `order.schema.ts` (5 schemas) |
| Web | `app/d/[token]/page.tsx` + `layout.tsx`, `lib/api.ts` (`riderApi`), `lib/upi.ts` |
| Mobile | `features/delivery/delivery.api.ts`, `lib/delivery-message.ts`, `components/delivery/SendToDeliverySheet.tsx`, `components/delivery/DeliveryCashCard.tsx`, `orders/[id].tsx` (send/resend/change, status, warnings, live socket), `dashboard.tsx`, `orders.api.ts` (types), `content.ts` (privacy text) |

## Verification
- **New `scripts/smoke-delivery.ts`: 50/50 checks pass** against a real server + dev DB (roles, cross-café, hash-only storage, expiry, reassign kills old link, guessed/malformed tokens, AMOUNT_CHANGED, over-collect, double tap, short payment, paid-at-counter, charge changed, cancel, self, removed person, cash totals, settle twice, cross-café settle, audit).
- **Existing `smoke-security.ts`: 140/140 still pass** (incl. account deletion with the new tables).
- Dev DB: all 5 pending migrations (12–18 Oct) applied cleanly.
- Delivery-boy page screenshotted at 390 px in all 6 states (to collect, already paid, cancelled, delivered, expired, invalid link).
- Backend, mobile and web `tsc` clean; web lint clean.
- **Not done:** a real phone test of the app sheet + WhatsApp opening (needs a new APK).

## Phone test
- [ ] Delivery order → Food is ready → Send to delivery person → add Raju (your 2nd phone) → WhatsApp opens with the message → Send.
- [ ] On the 2nd phone: open the link → Call works, Exact pin opens Maps, Show UPI QR scans with the right amount.
- [ ] Tap Cash → Delivered → confirm → the café phone shows "Delivered by Raju · ₹… cash" without refreshing.
- [ ] Dashboard shows "Cash with delivery people · Raju" → Got ₹… → gone.
- [ ] Change person → the old link says "not valid".
- [ ] "Customer not available" → the café sees the ⚠️ and "Call the customer".
- [ ] Owner cancels while out → the link says "cancelled, take it back".
