# Cafe POS — Build Progress Log
**Date:** October 8, 2026 (Day 11)
**Focus:** Mobile app UI redesign, **Phase 1 (foundation)**: BillRaw brand across the whole app.
**Branch:** `ui-espresso-trial` (main untouched until Vicky approves).

Every change carries a `UI REDESIGN (2026-10-08)` / `UI TRIAL` comment.

---

## 1. Decisions

- **Brand:** generic Tailwind blue (`#2563EB`) → **Espresso `#2B1F14` + Roast Gold `#C08A2E`** on a warm paper background (`#F7F5F1`), the same as billraw.in, order.billraw.in, the review card and the app icon. Status colours stay semantic (green/amber/red).
- **Fonts:** **Geist** everywhere (Google Fonts). Numbers use `tabular-nums`. *Geist Mono was tried and dropped:* its slashed zero looked like a developer tool. **Space Grotesk stays** for Vicky's BillRaw wordmark + animated splash (`typography.fontFamilyBrand`).
- **Vicky's resources:**
  - Geist ✅
  - shadcn: **design language only** (it's web-only)
  - Hugeicons: skipped (Lucide is already used consistently on every screen; switching = 100+ swaps for little gain)
  - Keyline / Morphicons / transitions.dev: skipped (web/CSS)
  - thesvg: later, for WhatsApp/UPI logos
- **Skills:**
  - installed **baseline-ui** + **fixing-motion-performance** from ibelick/ui-skills (markdown only, reviewed; the repo's CLI/site code was not run)
  - used **animate-expo** (motion on mobile) + emil-design-eng
- **Motion rules (animate-expo):**
  - press feedback = scale 0.97 in 120 ms on the UI thread + one haptic
  - **no** entrance animations or count-ups on screens opened dozens of times a day; numbers animate **only when they change live**
  - reduce-motion respected

## 2. Trial → feedback → fixes (Dashboard)

Vicky approved the look but flagged the cards. Root causes, and the fixes:

1. Layout props sat on an inner view inside `Pressable`, so the tiles wrapped 3+1 and the quick actions became thin pills. **Fix:** a new `components/ui/PressScale.tsx` with the style on the animated Pressable itself.
2. Percentage `flexBasis` + `gap` wrapped wrongly. **Fix:** explicit 2×2 rows.
3. Tiles were too tall/bubbly and had chevron clutter. **Fix:** compact tiles (icon + label row, big tabular number, one sub-line).
4. Mono zeros. **Fix:** Geist + tabular-nums.
5. Removed the bell icon (it did nothing) and a 900 ms count-up on every open.

## 3. App-wide (Phase 1)

| What | How |
|---|---|
| Colours | `theme/brand.ts` (single source); `theme/colors.ts` keeps the **same keys** with brand values, so all **~940 `theme.colors.*` uses** re-skin automatically. New keys: `borderStrong`, `accent`, `accentInk`, `accentLight`. |
| Hard-coded colours | Codemod: **45** cold greys/blues/Material reds/greens → brand palette (15 files). Kept on purpose: WhatsApp green, the online dot. |
| Item icon colours | `lib/product-visual.ts`: bright violet/sky/pink → the **same warm palette as the web QR menu** |
| Fonts | Codemod: **210 `fontWeight` → Geist families** + **110 styles given Geist Regular**, 0 skipped. (Custom fonts ignore `fontWeight` on Android, so the weight is in the family name now.) |
| Radius | 6/8/12 → **8/12/16** (+ `xl` 20): softer, matches the web |
| Button | Reanimated press scale 0.98/120 ms, espresso primary, accessibility state (disabled/busy). No haptic (the action itself gives success/error, so one haptic per action). |
| TextField | 1 px border, **roast-gold focus**, brand cursor + selection colour |
| New components | `PressScale` (press feel for any card/tile), `LiveNumber` (animates only on live change) |
| Deps | `react-native-reanimated` 4.5.1 + `react-native-worklets` 0.10.1 (`npx expo install`, SDK-matched), `@expo-google-fonts/geist` + `geist-mono` (per-weight imports, only 6 font files bundled). Expo patch updates aligned. |

**Verification:**
- `tsc` passes; **expo-doctor 21/21**; root lockfile `--frozen-lockfile` OK.
- Backup of the pre-codemod source: scratchpad `mobile-backup-1651`.
- ⚠️ Needs Vicky's eyes on a real phone (`npx expo start -c`). The look can't be screenshotted here (no web target).

## 3b. Crash fix: Reanimated removed (same day)

- **Symptom (Vicky, Expo Go):** `TypeError: undefined is not a function` + `Route "./(…)/x.tsx" is missing the required default export` on ~19 screens, plus `Cannot read property 'ErrorBoundary' of undefined`.
- **Cause:** every failing route imported `Button` or `PressScale`, both of which now imported **Reanimated 4**, and Reanimated threw on import in Expo Go. Versions were correct (4.5.1 / worklets 0.10.1 = the SDK 57 bundled versions; the Babel plugin resolves fine), so it's an Expo Go + Reanimated runtime incompatibility on this setup.
- **Fix:** `PressScale`, `LiveNumber` and `Button` now use **React Native core `Animated` with `useNativeDriver: true`**. Transform/opacity only, ease-out 120 ms / 220 ms, so it still runs on the UI thread. Reduce-motion comes via `AccessibilityInfo` (`useReduceMotion()` in PressScale.tsx). The direct `react-native-reanimated` / `react-native-worklets` deps were removed. They remain only as a transitive dependency of Expo packages, not imported by our code.
- **Lesson:** for press/fade feedback, core Animated + the native driver is enough and more robust. Reanimated is only worth it for gesture-driven motion (swipe, drag), and then it must be tested in Expo Go **and** an EAS build before shipping.
- Re-verified: `tsc` passes, expo-doctor 21/21, no Reanimated imports in app/components/lib/features.

## 3c. Phase 2 (same day): screen-by-screen

**Shared building blocks** (one change → every screen):
- `theme/ui.ts`: `headerBar`, `iconButton` (40 px white circle + hairline), `headerTitle` (17 semibold), `card`, `sectionTitle`, `softShadow`. A codemod wired them into **21 screens** (12 with the `header/backBtn/headerTitle` pattern + 9 that used a bare 32 px arrow).
- `components/ui/AppTabBar.tsx`: one tab bar for **Owner/Manager and Cashier**. The cashier previously had the default system tab bar (different font and colours). Active = espresso icon + wash pill; inactive = textSecondary (the old textMuted was too faint for icons); no tab-switch animation; hairline top border.
- All black shadows → warm espresso tone (11 files); sheet backdrops cold slate → warm `rgba(26,20,14,0.5)`.

**Screens redesigned by hand:**
- **Billing** (cashier, used hundreds of times a day):
  - filler subtitle removed
  - live-strip chips with customer name + status dot
  - category rail active = espresso fill
  - item rows use PressScale, a 36 px "+ Add" button and an espresso stepper (34×36 targets)
  - "from ₹X · customisable" on one line
  - a **slim cart panel** (`2× Cappuccino … ₹280` + one "Items · GST" line + a big "Review order ₹X →") that no longer covers the menu
- **KDS: dark mode** (`theme/brand.ts` → `kds` palette, light status bar):
  - columns by width (phone 1 / 600 dp 2 / 900 dp 3)
  - text readable from 2 m (order # 22 px, items 16 px, notes 13 px amber; was 10–13 px)
  - **40 px Start/Ready buttons** (were ~24 px), 48 px "Mark order ready"
  - urgency via the time chip + card border (the left colour bar was removed)
  - **fixed icon centring** (`justifyContent` had been commented out and patched with `paddingTop`)
  - filler subtitle removed; "All caught up" empty state
- **Orders list:**
  - warm background, PressScale cards
  - raw DB words → labels (`UNPAID` → Unpaid, `DINE IN` → Dine-in, Pending → New)
  - tabular numbers, 38 px Serve button
- **Order detail:** "Paid via CASH" → "Paid · Cash", order type labels.
- **Settings:** role "OWNER" → "Owner".
- **Auth (login/register/verify/forgot):** warm background, **roast-gold links** (they now look tappable), "Create an organization" → "Create your café account".

**App-wide cleanups:**
- **Tab root screens (Menu, Staff, Tables): removed the back arrow** (it went nowhere) and the duplicate ALL-CAPS badge.
- Eyebrow badges ("NEW ITEM", "SETUP", "NEW STAFF", the category name in caps) removed on 4 more screens.
- **ALL-CAPS tracked section labels → sentence case** (Settings, Reviews, Order detail, Setup).
- **₹ formatting:** 26 raw `₹{value}` → `formatINR()` (Indian grouping `₹1,250`, no float junk like `₹105.00000001`) across billing, cart, checkout, order detail, variant sheet, orders list, plus the WhatsApp bill message.

**Verification:** `tsc` passes, expo-doctor 21/21, no Reanimated imports.

**Not yet done individually** (they have the new theme, headers, fonts and labels, but no per-screen layout pass): Menu/Products/Create product, Staff/Create staff, Tables, Inventory, Setup, Cart, Checkout, Confirmation, Sales report, QR, Reviews, Audit logs, Outlet edit, Change password, Delete account, Legal, Consent. **Phase 3** (payment success moment, toast) and **Phase 4** (live "today", milestones, end-of-day card) are still to do.

## 3d. Phase 2, round 2: every remaining screen

**Consistency (codemods, all screens):**
- **16 px gutters everywhere** (the tab screens were 24 px, so content jumped when switching tabs): Menu, Items, Staff, Tables, Inventory, Setup, all create forms, settings sub-screens, the skeleton list. Auth/consent/sheets keep 24 px on purpose (centred forms).
- List-screen bottom buttons: no separator line, **no brown glow**, 52 px. Card press = dim + scale 0.98.
- Role chips: Cashier amber / Chef green → brand colour (green/amber are reserved for status meanings).
- **Minimum text 11 px** (5 places were 9–10 px).
- **Tap targets ≥ 40 px:** cart stepper 24 → 34×36, inventory stepper 32 → 40, variant sheet close 32 → 40, quantity buttons 32 → 40, billing cart stepper 28 → 34, forgot-password back → the shared round button.
- **Sentence case** for 35 titles/labels across 19 files ("Sales Report" → "Sales report", "Organization Name" → "Business name", "Tax Rate %" → "GST %", "Low Stock Alert At" → "Alert me when stock is below"…).
- Settings rows get press feedback; Items prices → `formatINR`; audit-log amounts → `formatINR`; "₹X received via CASH" → "₹X received via Cash".

**Screens:**
- **Cart:**
  - the disabled "continue" button now *looks* disabled (it used to look enabled)
  - "Proceed to Checkout" → "Continue to payment"
  - "Your Cart" → "Cart"
- **Checkout:**
  - 🐛 **removed a fake QR**: the UPI option showed a grey QR *icon* with "Customer scans to pay", but there was no real QR. It now says "Collect ₹X on your café's UPI QR — check the payment arrived before placing the order".
  - ✨ **Quick cash buttons:** Exact / next ₹50 / ₹100 / ₹500 / ₹2,000 (computed from the bill), so the cashier taps instead of typing.
  - shared header; "Place order · ₹1,250"
- **Confirmation (Phase 3, payment moment):**
  - a green ✓ pop-in (240 ms, native driver, reduce-motion = fade only; deliberately short because it shows after every order)
  - **big "₹420 / Payment received"**, "Order #23 sent to the kitchen"
  - WhatsApp bill + "New order" as the two follow-up actions
- **Variant/add-on sheet:** 48 px option rows, "Add to order".
- **Setup:** glow removed, gutters.
- Kept as-is on purpose: the BrandMark shadow (Vicky's logo).

**Verification:** `tsc` passes; expo-doctor 21/21; 0 Reanimated imports; 56 files vs `main`.

## 4. Next: Phase 2 (screen by screen, most used first)

1. **Billing** (speed: item tiles, always-visible cart, fewer taps)
2. **KDS dark mode** (readable from 2 m, urgency colours, big targets)
3. Orders → Order detail → Menu/Products → Staff/Tables → Settings/Reviews/QR → Auth/Onboarding
4. Phase 3: payment success moment, sheets, toasts. Phase 4: habit loop (live today, milestones).
