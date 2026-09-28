import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Dashboard alone fires 5 parallel calls per focus, Setup fires 3 more — during
// active development (frequent navigation + Fast Refresh remounts), a tight
// production-grade limit gets hit by completely normal testing, not abuse.
// Keep production strict; relax generously in every other environment.
const isDev = env.NODE_ENV !== "production";

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 2000 : 100, // max requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    data: null,
    error: null,
  },
});

// Stricter limiter specifically for login — prevents brute-force password guessing.
// Kept meaningfully tighter than the general limiter even in dev, so this still
// behaves like the real thing when testing login/OTP flows.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 200 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
    data: null,
    error: null,
  },
});