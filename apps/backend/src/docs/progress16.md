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

---

# Feature 3: Item photos (ImageKit)

Vicky chose ImageKit now (free up to ~20 GB/month of views, no DNS change) → Cloudflare R2 later (~20 cafés). The ImageKit code is all in `utils/imagekit.ts`, so switching later touches mainly that file.

**ImageKit account:** a new dedicated account, ID `billraw`, region **Mumbai**, Free plan. Keys in `apps/backend/.env` + Render (`IMAGEKIT_URL_ENDPOINT`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`). The private key never goes to the app or website.

## Flow
1. Owner/Manager → Menu → item → **Photo** (top of the edit screen) → Gallery or Camera → square crop.
2. On the phone: resized to ≤800 px, JPEG 70% (~60–120 KB) before upload.
3. App asks our server for a **one-time signature** (10 min, single-use) → uploads **straight to ImageKit** into `/outlets/<outletId>/products`.
4. App sends the fileId → server **asks ImageKit** for the file and checks: it exists, it's in **this café's folder**, it's an **image**, it's **≤ 2 MB**. Only then is it set on the item. The old photo is deleted.
5. Customer website: real photo on the menu grid + item popup, as a small ImageKit version (`?tr=w-…`, 2× display size), `loading="lazy"`. **If a photo fails** (free limit used up / network), the old artwork shows, so the menu never looks broken. Cart and status thumbnails keep the artwork (saves bandwidth).

## Edge cases handled
| Case | Result |
|---|---|
| Cashier / Chef | No upload permission, no remove (403) |
| Café B → café A's item / photo / folder | 404 / 400 (folder check) |
| Made-up fileId | 400, item unchanged |
| Non-image file | 400 + deleted from ImageKit |
| Signature reused | Rejected by ImageKit |
| Setting `imageUrl` through the normal item edit | Ignored (schema doesn't allow it) |
| Change photo | Old file deleted |
| Remove photo / delete item / delete account | Files deleted from ImageKit (account → whole café folder) |
| Camera permission denied | Clear message + "Open Settings"; Gallery still works |
| Upload fails (net) | Old photo stays, error shown, retry |
| ImageKit keys missing on server | 503 "Photos aren't set up yet", the rest of the server keeps working |

## Permissions (Play Store)
- `expo-image-picker` plugin in `app.json`: **camera** (only asked when "Camera" is tapped), **microphone blocked** (`microphonePermission: false`).
- Gallery = Android system photo picker (Android 13+ needs **no** photo permission). The library only adds storage read for Android ≤ 12 (`maxSdkVersion 32`). **No `READ_MEDIA_IMAGES`**, so no Play "photo permissions" declaration is needed.
- Data Safety: add **Photos → collected, app functionality, not shared** (to be conservative).
- In-app privacy text: "Menu photos" bullet (ImageKit, India region, deleted with item/account).

## Files
| Area | Files |
|---|---|
| DB | `products.imageUrl`, `products.imageFileId`. Migration `20261018120000_product_image` |
| Backend | `utils/imagekit.ts` (new), `config/env.ts` (optional IMAGEKIT_*), `menu.service/controller/routes` (image-auth, PUT/DELETE image, delete item → delete photo), `public-menu.service.ts` (imageUrl), `auth.service.ts` (account delete → photos) |
| Mobile | `expo-image-picker` + `expo-image-manipulator` (SDK 57), `app.json` plugin, `lib/photo-upload.ts`, `lib/photo-url.ts`, `components/menu/ProductPhoto.tsx`, `menu.api.ts`, `create-product.tsx`, `products.tsx` (thumbnail), `content.ts` |
| Web | `components/ProductPhoto.tsx` (new), `order/[slug]/page.tsx`, `ProductModal.tsx`, `lib/api.ts` |

## Verification
- **New `scripts/smoke-photos.ts`: 23/23 pass against the real ImageKit account** (roles, cross-café, folder check, fake/non-image files, signature reuse, replace/remove/delete item/delete account → files really gone, thumbnail URL works). All test files cleaned up (only ImageKit's own 2 sample files remain).
- Re-run: `smoke-security` 140/140, `smoke-delivery` 50/50.
- Dev DB migrated. Backend/mobile/web `tsc` clean, web lint clean.
- **Not done:** a real phone test (camera/gallery/crop). **A new APK is required** (2 new native modules).

## Phone test
- [ ] Menu → item → Add photo → Gallery → crop → photo appears in a few seconds.
- [ ] Camera → first time asks permission → take photo → appears.
- [ ] Deny camera → message + Open Settings; Gallery still works.
- [ ] Item list shows the thumbnail; the QR menu website shows the photo (grid + popup).
- [ ] Change → new photo; Remove → website back to the artwork.
- [ ] Cashier login → no photo option anywhere.
