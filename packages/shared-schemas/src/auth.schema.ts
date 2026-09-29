import { z } from "zod";

// FIX (2026-09-30): saare naam/address/text fields pe `.trim()` aur emails pe
// `.trim().toLowerCase()` — sabhi schema files mein. Pehle "Vicky Sahu " (aage-peeche
// space) waise hi save hota tha, aur OTP email mein "Hi Vicky Sahu ," dikhta tha.
// Passwords ko jaan-bujh ke trim NAHI karte (space bhi password ka hissa ho sakta hai).

// Owner registers Organization + first Outlet + their own account
export const RegisterOrganizationSchema = z.object({
  organizationName: z.string().trim().min(2, "Organization name is too short"),
  ownerName: z.string().trim().min(2, "Name is too short"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  outletName: z.string().trim().min(2, "Outlet name is too short"),
  outletAddress: z.string().trim().min(5, "Address is too short"),

  // DPDP Act, 2023 — proof that notice was shown and consent was given at
  // signup. Sent by the client at the exact moment the checkbox is checked
  // (see register.tsx). Validated here so a request can never skip this
  // field entirely or send a garbage/forged value — the endpoint rejects
  // registration outright without it, same as a missing password.
  consentAcceptedAt: z
    .string()
    .datetime({ message: "Invalid consent timestamp" })
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
      { message: "Consent timestamp cannot be in the future" }
    ),
});
export type RegisterOrganizationInput = z.infer<typeof RegisterOrganizationSchema>;

// Login — email + password
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// Owner/Manager creates a staff account (Cashier or Chef, or another Manager)
export const CreateStaffSchema = z.object({
  name: z.string().trim().min(2, "Name is too short"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["MANAGER", "CASHIER", "CHEF"]), // Owner is created only via register
  outletId: z.string().uuid("Invalid outlet ID"),
});
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

// NOTE (follow-up, not yet implemented): staff created via CreateStaffSchema
// haven't personally consented to anything yet — the Owner filled this form on
// their behalf. For full DPDP compliance, add a one-time "accept Terms &
// Privacy Policy" step on a staff member's own first login, and validate/store
// consentAcceptedAt there the same way this schema does for the Owner.


// Mobile refresh/logout: token body mein aata hai
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(20, "Refresh token is required"),
});
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

// OTP verify: userId + 6-digit OTP
export const VerifyEmailSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
});
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// Resend OTP: sirf userId chahiye
export const ResendOtpSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});
export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;

// Owner/Manager staff ko deactivate/reactivate karta hai
export const SetStaffStatusSchema = z.object({
  isActive: z.boolean(),
});
export type SetStaffStatusInput = z.infer<typeof SetStaffStatusSchema>;

// ─────────────────────────────────────────────────────────
// FIX (2026-09-29): PASSWORD RESET + ACCOUNT DELETION
// Pehle password bhoolne ka koi raasta nahi tha (Owner hamesha ke liye locked
// out), aur account delete karne ka bhi nahi (Play Store ka mandatory rule).
// ─────────────────────────────────────────────────────────

// Naya password — bcrypt 72 bytes ke baad ignore karta hai, isliye max 72
const NewPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long");

// Step 1: "Forgot password?" — email pe OTP maango
export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// Step 2: OTP + naya password
export const ResetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  newPassword: NewPasswordField,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// Logged-in user apna password badle (purana password dena zaroori)
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: NewPasswordField,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// Owner/Manager kisi staff ka password reset kare (staff ke paas asli email na ho tab)
export const ResetStaffPasswordSchema = z.object({
  newPassword: NewPasswordField,
});
export type ResetStaffPasswordInput = z.infer<typeof ResetStaffPasswordSchema>;

// Owner poora account + cafe data delete kare — password + "DELETE" type karna zaroori
export const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirmText: z.literal("DELETE", { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;