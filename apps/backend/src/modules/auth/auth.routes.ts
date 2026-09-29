import { Router } from "express";
import * as authController from "./auth.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  RegisterOrganizationSchema,
  LoginSchema,
  CreateStaffSchema,
  RefreshTokenSchema,
  SetStaffStatusSchema,
  VerifyEmailSchema,
  ResendOtpSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ChangePasswordSchema,
  ResetStaffPasswordSchema,
  DeleteAccountSchema,
} from "@cafe-pos/shared-schemas";
import { authRateLimiter, otpRateLimiter, registerRateLimiter } from "../../middleware/rate-limiter";

const router = Router();

// FIX (2026-09-29): registerRateLimiter add kiya (email-bombing / fake signup guard)
router.post("/register", registerRateLimiter, validate(RegisterOrganizationSchema), authController.register);
router.post("/verify-email", otpRateLimiter, validate(VerifyEmailSchema), authController.verifyEmail);
router.post("/resend-otp", otpRateLimiter, validate(ResendOtpSchema), authController.resendOtp);
router.post("/login", authRateLimiter, validate(LoginSchema), authController.login);
// NOTE (2026-09-29): /refresh pe jaan-bujh ke strict limiter NAHI hai — cafe ke
// saare devices ek hi WiFi IP share karte hain, aur refresh block hone pe app
// staff ko logout kar deta hai. Token 96-hex random hai (guess nahi ho sakta),
// global rateLimiter hi kaafi hai.
router.post("/refresh", validate(RefreshTokenSchema), authController.refresh);
router.post("/logout", validate(RefreshTokenSchema), authController.logout);
router.post(
  "/staff",
  authenticate,
  authorize("OWNER", "MANAGER"),
  validate(CreateStaffSchema.omit({ outletId: true })),
  authController.createStaff
);
router.patch(
  "/staff/:id/status",
  authenticate,
  authorize("OWNER", "MANAGER"),
  validate(SetStaffStatusSchema),
  authController.setStaffStatus
);
router.get("/staff", authenticate, authorize("OWNER", "MANAGER"), authController.getStaff);
router.get("/me", authenticate, authController.getMe);

// FIX (2026-09-29): password reset + account deletion routes
// forgot/reset public hain (user logged-out hota hai) — isliye otpRateLimiter
// (IP limit) + service mein per-user cooldown/attempt limits dono lagte hain
router.post("/forgot-password", otpRateLimiter, validate(ForgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", otpRateLimiter, validate(ResetPasswordSchema), authController.resetPassword);
router.post(
  "/change-password",
  authenticate,
  authRateLimiter, // purana password guess karne se rokne ke liye
  validate(ChangePasswordSchema),
  authController.changePassword
);
router.post(
  "/staff/:id/reset-password",
  authenticate,
  authorize("OWNER", "MANAGER"),
  validate(ResetStaffPasswordSchema),
  authController.resetStaffPassword
);
router.delete(
  "/account",
  authenticate,
  authorize("OWNER"),
  authRateLimiter,
  validate(DeleteAccountSchema),
  authController.deleteAccount
);

export default router;