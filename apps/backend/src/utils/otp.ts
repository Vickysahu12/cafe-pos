/**
 * OTP UTILS
 * ─────────────────────────────────────────────────────────
 * USE CASE: 6-digit OTP generate karna aur verify karna. OTP
 * kabhi plain text store nahi hota — password ki tarah hash karke
 * rakha jaata hai, taaki agar database leak ho, OTPs bhi safe rahein.
 *
 * CONNECTED TO:
 * - utils/password.ts   → same hash/compare functions reuse karte hain
 * - auth.service.ts       → OTP generate/verify yahin se hoga
 */

import { hashPassword, comparePassword } from "./password";

/** USE CASE: Random 6-digit OTP banata hai, jaise "483920" */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** USE CASE: OTP ko hash karta hai storage ke liye (bcrypt reuse kar rahe hain) */
export async function hashOtp(otp: string): Promise<string> {
  return hashPassword(otp);
}

/** USE CASE: User ne jo OTP diya, usko stored hash se compare karta hai */
export async function verifyOtp(otp: string, otpHash: string): Promise<boolean> {
  return comparePassword(otp, otpHash);
}