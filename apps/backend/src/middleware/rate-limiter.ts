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
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage("Too many login attempts, please try again later"),
});

// verify-email + resend-otp. Per-OTP attempt limit DB mein alag se hai (auth.service.ts)
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage("Too many OTP attempts, please try again later"),
});