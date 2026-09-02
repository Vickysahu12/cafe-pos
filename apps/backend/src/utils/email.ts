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

const resend = new Resend(env.RESEND_API_KEY);

/** USE CASE: Registration/resend ke waqt OTP email bhejta hai */
export async function sendOtpEmail(toEmail: string, name: string, otp: string) {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: toEmail,
    subject: "Verify your email — Cafe POS",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 4px; background: #f4f4f4; padding: 16px; text-align: center; border-radius: 8px;">${otp}</h1>
        <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}