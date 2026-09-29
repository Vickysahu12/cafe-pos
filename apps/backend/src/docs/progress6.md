# Cafe POS — Build Progress Log
**Date:** September 30, 2026 (Day 6)
**Status:** 🎉 **Launch coding is complete.** What's left is setup (accounts, deploy) and real-cafe testing.

Every change carries a `// FIX (2026-09-30): ...` or `ADDED (2026-09-30)` comment.

---

## 1. Setup done by Vicky today

- ✅ **Domain `billraw.in`** bought (Hostinger, auto-renew on, valid till 2027-09-30).
- ✅ **Resend email domain verified.** DKIM, SPF (CNAME `rsend`/`send`) and DMARC records added in Hostinger DNS. OTP emails now come from `no-reply@billraw.in` and reach **any** inbox. Tested: delivered to a different person's Gmail, in Inbox (not spam).
- Local `apps/backend/.env` → `EMAIL_FROM=no-reply@billraw.in`.
- ⏳ Play Console moved to tomorrow (needs PAN/Aadhaar documents).

## 2. Code done today

| # | What | Where |
|---|---|---|
| 1 | **Names/text trimmed, emails lowercased** in every schema (OTP email said "Hi Vicky Sahu ,"). Passwords intentionally not trimmed. The email template also trims names already saved with spaces. | `packages/shared-schemas/src/*.ts`, `utils/email.ts` |
| 2 | **Cancel Order button** (Owner/Manager only) with a required reason. The backend `/void` existed but the app had no button. Also: cancelled orders no longer show "Collect payment", refunded orders show "Cancelled & refunded" (was "Paid via null"), and errors show the real message. | `app/(cashier)/orders/[id].tsx` (also used by admin), `orders.api.ts` |
| 3 | **Staff consent on first login (DPDP).** Staff created by an Owner see a one-time "accept Terms & Privacy" screen. It's recorded with a timestamp + `CONSENT_ACCEPTED` audit log (idempotent). Declining logs out. | backend `POST /auth/consent`, login + `/me` return `consentAcceptedAt`; mobile `app/consent.tsx`, `app/index.tsx` |
| 4 | **Deployment files** | see below |

### Deployment files (new)

- **`render.yaml`**: one-click Render Blueprint. Singapore region, Starter plan, `--prod=false` install (otherwise the build fails without TypeScript/Prisma), migrations as `preDeployCommand`, `/health` check. Secrets are marked `sync: false`, so Render asks for them and they never go in code.
- **`apps/mobile/eas.json`**: `preview` (APK for direct install / pilot cafes) and `production` (Play Store bundle, auto-incrementing version), both pointing at `https://api.billraw.in/api/v1`. Removed the hardcoded `versionCode` from `app.json` (EAS manages it now).
- **`.github/workflows/ci.yml`**: every push/PR builds the shared packages + backend and type-checks mobile + web. A red ❌ on GitHub means don't deploy.

### Decision: Float → Decimal moved to after launch
Every money calculation already goes through `round2()` (exact to the paisa for any cafe-sized bill). Converting to Prisma `Decimal` changes the API number format and would need changes on every screen, which is too risky right before launch. Planned for week 2–3 after launch.

## 2b. 🚀 Backend deployed to production (evening)

- **Neon** production project `billraw-prod` (Singapore), separate from dev. All 5 migrations applied by the first deploy.
- **Render** Blueprint service `billraw-api` (Singapore), **FREE plan for now** (no card yet). ⚠️ Switch to Starter before the first real cafe (see the TEMP comments in `render.yaml`).
- **Live at https://api.billraw.in** (CNAME `api` → `billraw-api.onrender.com` in Hostinger; Google Trust Services cert, auto-renewed).
- Resend: separate `billraw-production` key (Sending access, billraw.in only) on Render.
- **Deploy fixes:**
  - pnpm 12 rejects `--prod=false`, so the install now uses `NODE_ENV=development pnpm install` (verified with a clean-clone build first).
  - Added a `buildFilter` so mobile/web-only pushes don't redeploy the backend.
  - The free plan doesn't allow `preDeployCommand`, so migrations run at the end of the build.
- **Production checks passed:** health, clean errors, auth blocking, bad JSON → 400, HSTS + nosniff headers, production rate limits, forgot-password anti-enumeration, socket reachable.
- Git scare: an accidental VS Code stash hid 23 files; restored from the stash, verified identical, committed, then the stash was dropped.

## 3. Verification

- Smoke test: **61/61 checks pass** (new: staff consent flow + idempotency).
- All CI steps pass locally: backend build, mobile tsc, web tsc.

## 4. What's left before launch

**Code:** nothing blocking. Only fixes from real testing (Day 3–4).

**Vicky (next):**
1. Play Console: Personal account, $25, identity verification (PAN/Aadhaar).
2. expo.dev account (for the Android build) + Vercel (customer QR site at `order.billraw.in`).
3. Add a card on Render → switch to Starter **before** the first real cafe.

**Me (next session):** UI makeover to compete with Petpooja, then the Android build pointing at api.billraw.in.

## 5. After launch (not blocking)
Float → Decimal, subscription billing (Razorpay), thermal printing, inventory auto-deduction, cursor pagination, unit tests, iOS.
