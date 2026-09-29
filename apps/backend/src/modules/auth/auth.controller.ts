import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as authService from "./auth.service";
import { prisma } from "../../config/db";
import { getIO } from "../../sockets";

// Staff deactivate hone par uske live sockets bhi turant kaat do, warna
// access token expire hone tak KDS/POS events sunta rahega
function disconnectUserSockets(userId: string) {
  try {
    const io = getIO();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.user?.userId === userId) socket.disconnect(true);
    }
  } catch {
    // socket server initialise nahi hua (jaise tests mein), ignore
  }
}

// FIX (2026-09-30): consentAcceptedAt bhi bhejte hain — null hai to mobile app
// staff ko pehle "Terms & Privacy accept karo" screen dikhata hai (DPDP Act).
const publicUser = (user: {
  id: string; name: string; email: string; role: string; outletId: string; consentAcceptedAt: Date | null;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  outletId: user.outletId,
  consentAcceptedAt: user.consentAcceptedAt,
});

/** USE CASE: Register, sirf userId return karta hai, OTP verify hone tak login nahi */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { userId, outlet } = await authService.registerOrganization(req.body);

  return sendSuccess(
    res,
    { userId, outlet: { id: outlet.id, name: outlet.name, slug: outlet.slug } },
    "OTP sent to your email. Please verify to continue.",
    201
  );
});

/** USE CASE: OTP verify, sahi hone par tokens body mein milte hain (mobile SecureStore mein rakhega) */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { userId, otp } = req.body;
  const { accessToken, refreshToken, user } = await authService.verifyEmail(userId, otp);

  return sendSuccess(
    res,
    { accessToken, refreshToken, user: publicUser(user) },
    "Email verified successfully"
  );
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  await authService.resendOtp(req.body.userId);
  return sendSuccess(res, null, "OTP resent");
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(email, password);

  return sendSuccess(res, { accessToken, refreshToken, user: publicUser(user) });
});

/** USE CASE: refresh token body mein aata hai (cookie nahi), naya access token milta hai */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const accessToken = await authService.refreshAccessToken(req.body.refreshToken);
  return sendSuccess(res, { accessToken }, "Token refreshed");
});

/** USE CASE: Logout, public route hai kyunki access token pehle hi expire ho sakta hai */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);
  return sendSuccess(res, null, "Logged out");
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await authService.createStaff(req.body, req.user!);

  return sendSuccess(
    res,
    { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    "Staff account created",
    201
  );
});

/** USE CASE: Staff deactivate/reactivate */
export const setStaffStatus = asyncHandler(async (req: Request, res: Response) => {
  const staffId = req.params.id as string;
  const { isActive } = req.body;

  const staff = await authService.setStaffActive(staffId, isActive, req.user!);
  if (!isActive) disconnectUserSockets(staffId);

  return sendSuccess(
    res,
    { id: staff.id, isActive: staff.isActive },
    isActive ? "Staff account reactivated" : "Staff account deactivated"
  );
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { outlet: true },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found", data: null, error: null });
  }

  return sendSuccess(res, {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    outlet: { id: user.outlet.id, name: user.outlet.name },
    consentAcceptedAt: user.consentAcceptedAt, // FIX (2026-09-30): staff consent gate ke liye
  });
});

/**
 * FIX (2026-09-30): STAFF CONSENT (DPDP Act, 2023). Owner ne staff account
 * banaya tha — staff ne khud kabhi Terms/Privacy accept nahi kiye. Pehli login
 * pe app consent screen dikhata hai, accept karne pe yeh endpoint timestamp +
 * CONSENT_ACCEPTED audit record likhta hai (Owner registration jaisa hi).
 */
export const acceptConsent = asyncHandler(async (req: Request, res: Response) => {
  const consentAcceptedAt = await authService.recordConsent(req.user!);
  return sendSuccess(res, { consentAcceptedAt }, "Thanks! Consent recorded.");
});

export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await authService.getStaffList(req.user!.outletId);
  return sendSuccess(res, staff);
});

// ─────────────────────────────────────────────────────────
// FIX (2026-09-29): password reset + account deletion handlers
// ─────────────────────────────────────────────────────────

/** USE CASE: Forgot password step 1 — hamesha same response (enumeration guard) */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.requestPasswordReset(req.body.email);
  return sendSuccess(
    res,
    null,
    "If an account exists for this email, we've sent a 6-digit code to it."
  );
});

/** USE CASE: Forgot password step 2 — OTP + naya password; user ke saare sessions band */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  const { userId } = await authService.resetPassword(email, otp, newPassword);
  disconnectUserSockets(userId);
  return sendSuccess(res, null, "Password updated. Please log in with your new password.");
});

/** USE CASE: Logged-in user ka password change — is device ko naye tokens */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.changePassword(
    req.user!,
    req.body.currentPassword,
    req.body.newPassword
  );
  return sendSuccess(res, tokens, "Password changed. Other devices have been logged out.");
});

/** USE CASE: Owner/Manager ne staff ka password reset kiya — staff turant logout */
export const resetStaffPassword = asyncHandler(async (req: Request, res: Response) => {
  const staffId = req.params.id as string;
  await authService.resetStaffPassword(staffId, req.body.newPassword, req.user!);
  disconnectUserSockets(staffId);
  return sendSuccess(res, { id: staffId }, "Staff password reset. They have been logged out.");
});

/** USE CASE: Owner poora cafe account delete kare (Play Store requirement) */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const { deletedUserIds } = await authService.deleteOwnerAccount(req.user!, req.body.password);
  deletedUserIds.forEach(disconnectUserSockets);
  return sendSuccess(res, null, "Your account and all cafe data have been permanently deleted.");
});