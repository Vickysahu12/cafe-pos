import { Router } from "express";
import * as authController from "./auth.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { RegisterOrganizationSchema, LoginSchema, CreateStaffSchema } from "@cafe-pos/shared-schemas";

const router = Router();

router.post("/register", validate(RegisterOrganizationSchema), authController.register);
router.post("/login", validate(LoginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post(
  "/staff",
  authenticate,
  authorize("OWNER", "MANAGER"),
  validate(CreateStaffSchema),
  authController.createStaff
);
router.get("/me", authenticate, authController.getMe);

export default router;