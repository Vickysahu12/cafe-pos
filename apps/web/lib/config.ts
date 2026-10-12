// lib/config.ts
// USE CASE: Backend API base URL. Same backend the mobile app talks to — this hits
// only the public-menu routes, which need no authentication.
// CONNECTED TO: lib/api.ts

// FIX (2026-10-12): pehle env na ho to chupchaap localhost pe chala jaata tha — Vercel pe variable
// chhoot jaye to HAR customer ko "Can't reach the café" (aur build green dikhta). Ab production
// build mein variable zaroori hai; localhost fallback sirf `next dev` ke liye.
const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
if (!fromEnv && process.env.NODE_ENV === 'production') {
  throw new Error('NEXT_PUBLIC_API_BASE_URL is not set. Add it in Vercel (Production + Preview) and redeploy.');
}
export const API_BASE_URL = fromEnv ?? 'http://localhost:3000/api/v1';