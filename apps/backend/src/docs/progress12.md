# Cafe POS — Build Progress Log
**Date:** October 9, 2026 (Day 12)
**Focus:** Full health check after pushing the mobile UI redesign, plus one real production fix.

---

## 1. Health check (all verified, not assumed)

| Check | Result |
|---|---|
| Git | `main` = `origin/main` = `04ec381` (UI redesign merged + pushed), working tree clean |
| `api.billraw.in/health` | 200, but **63 s** on the first request (Render free plan was asleep) |
| `order.billraw.in`, `billraw.in`, `billraw.in/privacy` | 200 (0.3–1 s) |
| Prod backend version | Latest. The new review route answers `Cafe not found` (not "Route not found"); QR orders demand a name. The review query reads `outlets.googleReviewUrl`, so **the 2026-10-05 migrations ran in production** |
| CI-equivalent locally | frozen install OK; `turbo build --filter=backend` 3/3; mobile + web `tsc` OK; `next build` compiled |
| Smoke test | **110/110 passed** (after the fix below) |

## 2. Real bug found + fixed: order transaction timeout

- **Symptom (smoke test, slow network day):** `create order → 500: Transaction already closed … timeout for this transaction was 5000 ms, however 5211 ms passed`.
- **Why it matters in production:** Prisma's default interactive-transaction timeout is **5 s**. Neon's free plan suspends the database when idle; waking it takes seconds, and order creation runs ~5 queries in one transaction (products, table check, counter upsert, order insert, table status). So **the first order after a quiet period (e.g. the morning) could fail.**
- **Fix:** `src/config/db.ts` → `new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 15_000 } })`. This applies to all 13 transactions (orders, pay, void, menu, auth, reviews). It's a safety margin only; normal orders still finish in milliseconds.
- **Verified:** smoke test 110/110 on the first attempt under the same slow network.
- Users never saw the internal Prisma text in production: the error handler hides 5xx messages when `NODE_ENV=production`. It only showed locally (development).

## 2b. New Owner/Manager tab bar (Vicky picked Option 1)

**Before:** Home · Menu · Staff · Tables (set-and-forget screens took the best spots; daily work had no tab and **owners couldn't bill at all**).
**Now:**
- **Owner:** Home · Orders · **[ + Bill ]** · Reports · More
- **Manager:** Home · Orders · **[ + Bill ]** · Stock · More (sales report is Owner-only on the backend)

| Piece | How |
|---|---|
| **Orders tab + live badge** | `features/orders/useActiveOrderCount.ts`: one fetch at layout mount, then socket `order:created/updated` (and refetch on reconnect). Counts New/Preparing/Ready. Removes only its own listeners (shared socket). Badge 99+ cap, espresso + roast-light text, white ring. |
| **Bill tab (centre)** | `BillTabIcon` (48×34 espresso pill with +). The owner reuses the **cashier billing flow**: `app/(admin)/{billing,cart,checkout,confirmation}.tsx` re-export the cashier screens. New `lib/use-flow-base.ts` makes every navigation in that flow stay in its own group (`/(admin)` or `/(cashier)`); otherwise the owner would land in the cashier tab bar and lose Home. The logout icon is shown only in the cashier app. |
| **Reports tab** | `sales-report` is now a tab root: no back arrow, big "Reports" title (More/Menu style). |
| **More tab** | New `app/(admin)/more.tsx`: a 2-column grid in groups **Manage** (Menu, Staff, Tables, Stock), **Grow** (QR codes, Reviews), **Account** (Audit logs [Owner], Settings). Each tile has an icon, a title and a one-line description, with PressScale. |
| Navigation | `backBehavior="history"` (More → Menu → back = More, not Home). Menu/Staff/Tables open from More, so **their back arrows are restored** (removed yesterday when they were tabs). Orders tab: no back arrow. |

**Backend fix (needed for owner billing):**
- `orders.controller.ts` now stores **`cashierId = the logged-in staff member`** (Owner/Manager/Cashier).
- Before, only CASHIER ids were saved, so an owner's order had `cashierId: null`, which is the **QR-order marker**. That would have shown a wrong "QR" badge in the app/KDS.
- Only the public QR route leaves it null. `cashierId` isn't used by any report.

**Bugs caught along the way:**
- An empty white circle showed where a back button would be: on the Orders tab (cashier + owner) and on sign-up step 1. The placeholder used the back-button style, which became a white circle on 10-08. Now a plain spacer.

**Verification:**
- `tsc` passes for backend and mobile.
- Smoke test **112/112** (+2: a cashier order records the cashier; **an owner order records the owner, not QR**).

## 3. Reminders (unchanged, still important)

- **Render Starter ($7) before the first real café:** free plan sleep = 30–63 s first request (today: 63 s). Also covers Neon wake-ups in combination with the fix above.
- New APK needed to see the UI redesign on the phone (`eas build -p android --profile preview`).

---

## 4. Reports batch 1 (Part A): Petpooja-level reports, Owner only

Vicky approved Part A: #1 comparison, #2 busy hours, #3 items, #6 staff, #7 discounts/cancellations, #11 day closing, #12 export.
Part B (stock recipes / auto-deduction) is **not started**. It waits for Vicky's 4 decisions.

### Backend (`modules/analytics/insights.service.ts`, new file)
| Endpoint | What it does |
|---|---|
| `GET /analytics/insights?period=today\|yesterday\|7d\|30d` | All Reports data in one call |
| `GET /analytics/today-compare` | Light (3 SQL): Dashboard hero "▲12% vs this time yesterday" |
| `GET /analytics/export?period=…&type=orders\|items` | CSV for Excel / the CA |

All three sit behind the existing `authorize("OWNER")`. `period` is whitelisted (400 otherwise), and `outletId` always comes from the token.

**Edge cases handled:**
- **Fair comparison:** today until 2 PM is compared with yesterday until 2 PM, not yesterday's full day. Otherwise every morning would show "-80%". 7d/30d work the same way (the previous period, up to the same point).
- **IST days:** SQL uses `AT TIME ZONE 'Asia/Kolkata'`.
- **Heatmap:** uses the **28 full days up to yesterday**, so each weekday appears exactly 4 times and the averages are correct. Today's incomplete day is left out.
- **Slow movers:** only items currently on the menu (archived/unavailable ones are excluded) that aren't best sellers. The app shows them only for 7 or 30 days, because one day isn't a fair test.
- **Same definitions everywhere:** revenue = PAID + non-cancelled, matching daily-summary (smoke checks they match).
- **Refunded** (paid, then cancelled) is shown separately with a warning: the riskiest case.
- **Discounts and cancellations by person:** taken from the audit log (an order only records who created it).
- **Removed staff:** their old data still shows, marked "removed". Only this outlet's users are looked up.
- **CSV safety:**
  - UTF-8 BOM, so Excel shows ₹ and Hindi names correctly
  - formula-injection protection (`=`, `+`, `-`, `@` get a `'` prefix)
  - **customer phone never exported** (DPDP)
  - plain numbers, so SUM works in Excel
  - capped at 20k rows, with a note if cut
  - `Cache-Control: no-store`
- **Load:** everything is aggregated in SQL and groupBy; orders are never loaded into JS (except the export, which is capped).

### Mobile
- **Reports tab** (`app/(admin)/sales-report.tsx`, rewritten):
  - Period toggle: Today · Yesterday · 7 days · 30 days. Each period is cached, so switching back is instant, and a slow old request can't overwrite the new one.
  - Espresso hero for sales, with ▲/▼ vs this time yesterday plus this time last Thu
  - Orders, avg bill, items sold, paid bills
  - **Day closing:** cash/UPI/card, collected, still to collect, first/last order, plus **"Share summary"**, a ready-made WhatsApp text to send to a partner
  - Sales by hour (for a day) / by day (7/30)
  - **Busy hours heatmap** (`components/reports/Heatmap.tsx`): plain RN Views, espresso intensity, tap a cell to read it, busiest slot shown first
  - Items: Best sellers · Slow movers · Categories
  - **Where orders come from:** counter vs QR self-order. If QR orders are 0, a nudge opens the QR codes screen.
  - **Staff:** orders, sales, avg bill, discounts, cancellations
  - **Discounts and cancellations:** amount, reason, who, "Was paid" tag
  - **Export** sheet: every bill / item sales → CSV → share sheet (`lib/share-csv.ts`; added `expo-file-system` + `expo-sharing`; Expo Go supports both)
- **Dashboard hero:** comparison line, and the link renamed "Sales report" → "Reports". If the call fails (e.g. an old backend), nothing shows and no error banner appears.

### Verification
- `tsc` passes for backend and mobile; the Android JS bundle (`expo export`) builds.
- **Smoke 137/137** (+25), including:
  - KPIs match daily-summary
  - refunded counted once
  - cancellation reason + who
  - discount + who
  - staff numbers
  - QR channel
  - archived item not a slow mover
  - 7d/30d/yesterday shapes
  - bad period → 400
  - cashier → 403
  - outlet B never sees A's data
  - CSV content type, the QR customer name present, **the phone absent**
  - bad export type → 400
  - cashier export → 403

### To ship
1. Push. Render redeploys the backend (no migration needed).
2. Expo Go works right away. For the APK, run `eas build -p android --profile preview`, because `expo-sharing` was added to the `app.json` plugins.

---

## 5. QR order alert on counter phones (chime + banner)

**Problem:** a customer's QR order chimed only on the kitchen tablet. The cashier's or owner's phone updated its list silently, so in a rush nobody noticed and the customer waited.

**Now** (`components/orders/QrOrderAlert.tsx`, mounted once in both the `(admin)` and `(cashier)` layouts, so it shows on every screen):
- **What triggers it:** the socket `order:created` event with **`cashierId === null` only (QR)**. A bill made at the counter never rings.
- **What the user sees:**
  - chime + vibration (reuses `useNewOrderAlert`)
  - espresso banner at the top: "New QR order #23", with "Table 4 · Rahul · ₹340" underneath
  - tap → that order's detail; tap when there are several → the Orders list
  - closes on X, an upward swipe, or after 6 seconds
- **Edge cases:**
  - **duplicates:** a seen-ids set (capped at 300), so reconnects or two rooms give one alert
  - **rush:** while a banner is showing, more orders merge into "3 new QR orders" (#21, #22, #23); the chime is throttled to once per 1.5 s
  - **fade-out:** an order arriving while the banner fades starts a new banner (closing flag + generation counter)
  - **background:** no sound; on return, a silent "while you were away" banner (queue capped at 50)
  - **privacy:** the customer's phone number is never shown
  - **accessibility:** reduce-motion → fade only; screen readers announce it
  - **unmount:** removes only its own listener, so the shared socket stays up
- **Setting** (`features/orders/qr-alert-prefs.ts`, SecureStore, per phone): Settings → Notifications → "Sound for new QR orders". Default ON. When OFF, the banner + light vibration still come. Cashiers have no Settings screen, so it is always ON on the counter phone.
- **Limit:** if the app is fully closed, or the socket is disconnected in the background, there is no alert. The Orders badge/list still refetch on reconnect, so orders aren't lost. Push notifications come later.

**Smoke additions (3):**
- the cashier socket gets the QR order with `cashierId: null`, order #, name, amount and table
- the owner's event is also marked as QR
- a counter bill's event carries the cashier id, so it never rings

**Verification:**
- `tsc` passes (mobile + backend); Android bundle (`expo export`) OK.
- ⚠️ **The live smoke test could not run tonight:** the dev Neon DB returns "Can't reach database server". TCP connects, so it is likely the free-plan compute quota. Run it once the DB is back: `PORT=3917 node dist/server.js` + `SMOKE_URL=http://localhost:3917 npx tsx scripts/smoke-security.ts` (expect 140/140).
