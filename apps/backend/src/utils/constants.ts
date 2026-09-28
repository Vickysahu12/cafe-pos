export const ROLES = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  CHEF: "CHEF",
} as const;

export const ACCESS_TOKEN_EXPIRY = "15m";

// Refresh token ab JWT nahi, random opaque string hai (DB mein hashed store hota hai).
// 30 din: POS counter pe cashier ko har hafte dobara login na karna pade.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// OTP abuse limits
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_OTPS_PER_HOUR = 5;