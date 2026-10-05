import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const isDev = env.NODE_ENV !== "production";

const limitMessage = (message: string) => ({
  success: false,
  message,
  data: null,
  error: null,
});

// General limiter. Cafe ke saare devices (cashier, chef, manager) ek hi wifi IP
// se aate hain aur dashboard ek baar mein kai parallel calls karta hai, isliye
// per-IP limit itni tight nahi honi chahiye ki normal use hi block ho jaye.
// Asli brute-force protection neeche ke strict limiters + DB-level limits se aati hai.
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage("Too many requests, please try again later"),
});

// Login brute-force
// FIX (2026-09-29): key ab IP + account (email ya logged-in userId) hai, sirf IP
// nahi. Cafe ke saare devices ek WiFi IP share karte hain — pehle shift change pe
// 5-6 staff login + 2-3 typos = poore cafe ka login 15 min ke liye BLOCK.
// Brute-force protection wahi rehti hai (ek account pe 10 guesses / 15 min).
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const account =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.user?.userId ?? "";
    return `${req.ip}:${account}`;
  },
  message: limitMessage("Too many login attempts, please try again later"),
});

// FIX (2026-09-29): /auth/register pe pehle koi strict limiter nahi tha — har
// register call ek OTP email bhejti hai (Resend ka paisa lagta hai), to koi bhi
// script se kisi ke inbox pe email-bombing ya hazaaron fake accounts bana sakta
// tha. Ek IP se 15 min mein 5 registrations kaafi hain.
export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage("Too many sign-up attempts, please try again later"),
});

// FIX (2026-09-29): public QR order route bina login ke hai — pehle sirf global
// 1000/15min limit thi, yaani koi bhi ek cafe ke KDS ko fake orders se bhar sakta
// tha. Key = IP + cafe slug: cafe ke shared WiFi pe kai asli customers ek hi IP
// se aate hain, isliye limit thodi generous hai (10 min mein 30 orders per cafe per IP).
export const publicOrderRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isDev ? 500 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.slug ?? ""}`,
  message: limitMessage("Too many orders from this device. Please ask the counter for help."),
});

// verify-email + resend-otp. Per-OTP attempt limit DB mein alag se hai (auth.service.ts)
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage("Too many OTP attempts, please try again later"),
});
// ADDED (2026-10-05): REVIEW BOOSTER public routes (bina login).
// Private feedback: spam se owner ka inbox bachao. Cafe ke shared WiFi pe kai asli customers
// ek IP se aate hain → key IP + slug, 15 min mein 10 messages kaafi.
export const publicFeedbackRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.slug ?? ""}`,
  message: limitMessage("Too many messages from this device. Please try again later."),
});

// Ginti (card scan / Google tap) — fake numbers se owner ke stats na bigdein
export const reviewEventRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isDev ? 500 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.params.slug ?? ""}`,
  message: limitMessage("Too many requests."),
});
