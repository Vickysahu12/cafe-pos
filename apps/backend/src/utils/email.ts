/**
 * EMAIL UTILS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Resend ke through emails bhejta hai. Abhi sirf OTP
 * email hai, but future mein password-reset, order-receipt jaisi
 * emails bhi isi pattern se add hongi.
 *
 * CONNECTED TO:
 * - config/env.ts    → RESEND_API_KEY, EMAIL_FROM
 * - auth.service.ts   → registerOrganization() aur resendOtp() isko call karte hain
 */

import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../config/logger";

const resend = new Resend(env.RESEND_API_KEY);

// FIX (2026-09-29): user ka naam email HTML mein bina escape ke jaata tha —
// koi register form mein naam ki jagah `<a href="phishing-site">Click</a>` daal
// ke humare domain se phishing link wala email kisi ke bhi inbox mein bhijwa
// sakta tha. Ab HTML special characters escape hote hain.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// FIX (2026-09-29): ek hi OTP template do kaam ke liye — signup verify aur
// forgot-password. Sirf subject + ek line alag hai.
const OTP_COPY = {
  EMAIL_VERIFY: {
    subject: "Verify your email — BillRaw",
    line: "Your verification code is:",
  },
  PASSWORD_RESET: {
    subject: "Reset your password — BillRaw",
    line: "Use this code to reset your BillRaw password:",
  },
} as const;

/** USE CASE: Registration/resend/forgot-password ke waqt OTP email bhejta hai */
export async function sendOtpEmail(
  toEmail: string,
  rawName: string,
  otp: string,
  purpose: keyof typeof OTP_COPY = "EMAIL_VERIFY"
) {
  // FIX (2026-09-30): trim — purane users ke naam mein trailing space save hai ("Hi Vicky Sahu ,")
  const name = escapeHtml(rawName.trim());
  const copy = OTP_COPY[purpose];
  // FIX (2026-09-29): Resend SDK error THROW nahi karta, `{ error }` return karta
  // hai — pehle failed email chupchaap "success" maan li jaati thi. Ab throw karte
  // hain taaki caller ko pata chale aur user ko sahi message mile.
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: copy.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>${copy.line}</p>
        <h1 style="letter-spacing: 4px; background: #f4f4f4; padding: 16px; text-align: center; border-radius: 8px;">${otp}</h1>
        <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email — your account is safe.</p>
      </div>
    `,
  });

  if (error) {
    // Asli Resend error sirf server log ke liye; user ko saaf message
    logger.error("Resend send failed", { error });
    const err: any = new Error("We couldn't send the verification email. Please try again in a minute.");
    err.statusCode = 502;
    err.code = "EMAIL_SEND_FAILED";
    err.expose = true; // error-handler.ts yeh message user ko dikhayega
    throw err;
  }
}