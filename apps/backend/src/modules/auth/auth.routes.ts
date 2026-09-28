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
} from "@cafe-pos/shared-schemas";
import { authRateLimiter, otpRateLimiter } from "../../middleware/rate-limiter";

const router = Router();

router.post("/register", validate(RegisterOrganizationSchema), authController.register);
router.post("/verify-email", otpRateLimiter, validate(VerifyEmailSchema), authController.verifyEmail);
router.post("/resend-otp", otpRateLimiter, validate(ResendOtpSchema), authController.resendOtp);
router.post("/login", authRateLimiter, validate(LoginSchema), authController.login);
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

export default router;