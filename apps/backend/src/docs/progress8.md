# Cafe POS — Build Progress Log
**Date:** October 2, 2026 (Day 8)
**Focus:** Premium redesign of the customer QR ordering site (order.billraw.in), in the same brand as the billraw.in landing page.

Every change carries a `REDESIGN (2026-10-02)`, `ADDED (2026-10-02)` or `FIX (2026-10-02)` comment.

---

## 1. Why

Vicky shared two inspo screens (food-photo menu + live order tracker). We have no food photos yet (decision: **photos are V2, after 10+ paid cafés**), so the design had to look premium without them, and **without fake stock photos, fake discounts or fake ETAs**.

Design guidance used: `impeccable` (pbakaus/impeccable, markdown references only; its downloaded binary was **not** run), `ui-ux-pro-max`, `frontend-design`, `emil-design-eng`.

## 2. Brand: matches the landing page now

| | Before | Now |
|---|---|---|
| Colours | Green `#134731` | **Espresso `#2B1F14` + Roast Gold `#C08A2E`** (landing tokens) |
| Font | Manrope | **DM Sans** (landing font, self-hosted by next/font) |
| Motion | Ad-hoc | Landing's Emil Kowalski curves; sheet slide-up, cart badge "pop", live progress bar |
| Browser surfaces | Defaults | Themed selection, caret, focus ring; tabular numbers on prices |

All contrast pairs were checked for WCAG AA (listed in `globals.css`).

## 3. The "photo slot" (how we look premium without photos)

`lib/product-visual.tsx` → `ProductArt`: every item gets a large square artwork exactly where a photo will go in V2.
- A warm gradient per food family (coffee brown, juice lime, pizza orange…), a top-left light highlight, a large faint rotated "ghost" icon plus a crisp centre icon.
- Small variation from a hash of the item name, so 6 coffees in one category don't look copy-pasted.
- **V2 is one line:** `imageUrl ? <img> : <ProductArt>`. No redesign needed.

## 4. Screens

**Menu (`/order/[slug]`)**
- Espresso hero: café monogram (initials until logos exist), name, address, **Table 5 / Takeaway** badge, "Pay at the counter · Live order tracking".
- The menu sits on a paper sheet that overlaps the hero, for a native-app feel.
- **Popular here** row: the café's **real** best sellers (see §5). It is hidden for new cafés, and there's no fake "Bestseller" tag.
- Item rows in the Swiggy/Zomato pattern (text left, photo slot right, **ADD** hanging off the slot), which Indian customers already know.
- Tapping an item opens the detail sheet. **Simple items can now take a kitchen note too** ("less spicy").
- Search ("Search 15 dishes") plus a Veg switch; sticky category chips with scroll-spy.
- Floating cart bar whose count badge pops on every add.

**Item sheet:** large photo slot, slide-up drawer, size/add-on rows with 56px tap height, note, quantity, "Add to order ₹X".

**Cart:** espresso order-type card (Dine-in · Table 5 / Takeaway), compact steppers, receipt-style bill (dashed total line), floating **Place order →** with a spinner.

**Order tracking (`/status/[id]`), like inspo 2:**
- Espresso hero with the big status and a live progress bar (light runs along the current step).
- "Placed 1:19 am · Updated 1:24 am".
- Vertical **timeline**: Placed → Preparing → Ready → Served/Picked up, each step with a plain-English meaning (table vs takeaway).
- Per-item status chips, then the bill.
- **No "18 min left"**: we don't know prep time, and a fake ETA causes fights at the counter.

**Root (`order.billraw.in/`):** branded hero plus a 3-step timeline; the uppercase eyebrow label was removed.

## 5. Backend

- `public-menu.service.ts`: `getPublicMenu` returns `popular`, the top 6 product ids by quantity over the last 30 days (cancelled orders excluded, only currently available items).
  - Raw SQL on the existing `orders(outletId, createdAt)` index.
  - **10-minute in-memory cache per outlet** (bounded at 5000 entries), so a QR scan doesn't run the query every time. Fine at 1000 cafés.
- `getPublicOrderStatus` also returns `updatedAt`.

## 6. Bug fixed (web + mobile app)

**Wrong item icons.** The matcher used `includes`, so "Cho**cola**te Brownie" matched *cola* and showed a soda can (in the app's Billing screen too).
- Keywords must now start a word.
- The keyword appearing **last** wins ("Chicken Burger" → burger, "Chocolate Shake" → shake).
- If nothing starts a word, it falls back to a substring match (cheesecake, milkshake).
- `chocolate`/`cocoa` were added to the drinks family.
- Tested on 12 tricky names. Fixed in both `apps/web/lib/product-visual.tsx` and `apps/mobile/lib/product-visual.ts`.

## 7. Verification

- `tsc` passes for web, mobile and backend; ESLint (web) is clean; `next build` passes against `https://api.billraw.in`.
- Smoke test: **ALL CHECKS PASSED**, with 3 new checks: status has `updatedAt`, `popular` contains only this café's menu product ids (max 6), `popular` never leaks another café's product.
- Visually checked at a true 390px phone width (headless Edge, in an iframe) with a temporary demo café (15 items, table, orders). The demo café was **deleted** afterwards and the temp script removed.
- ⚠️ **Vicky:** check on your real phone. The menu, item sheet, cart, place order and tracking pages all changed.

## 7b. Vercel deploy fix (2026-10-03)

**First deploy failed:** `npm error EBADDEVENGINES ... Invalid name "pnpm" does not match "npm"`.
- Vercel saw `turbo.json` at the repo root and ran `turbo run build` on its own.
- Turbo isn't installed inside `apps/web`, so it fell back to npx/npm, which our root `devEngines` (pnpm only) rejects.
- Overriding the Build Command in the dashboard didn't save.

**Fix:** a new file, `apps/web/vercel.json` (JSON can't hold comments, so the reason lives here):
- `"buildCommand": "next build"` builds Next directly. The web app uses no workspace packages, so Turbo isn't needed.
- `"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."` skips a website rebuild when a push only changes the backend or mobile app (the command runs inside `apps/web`). This saves Vercel build minutes.

## 8. Next

1. Commit + push (today's work, plus yesterday's uncommitted work if still pending).
2. Deploy `apps/web` → `order.billraw.in` on Vercel (see `docs/TOMORROW.md` step 3; env `NEXT_PUBLIC_API_BASE_URL` + `ENABLE_EXPERIMENTAL_COREPACK=1`). Render auto-deploys the backend change (`popular`) on push.
3. Play Console (start first: 12 testers × 14 days is the longest wait).
4. V2 (after 10+ paid cafés): product photo upload into the existing photo slot, plus café logo instead of the monogram.
