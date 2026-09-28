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

const publicUser = (user: {
  id: string; name: string; email: string; role: string; outletId: string;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  outletId: user.outletId,
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
  });
});

export const getStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await authService.getStaffList(req.user!.outletId);
  return sendSuccess(res, staff);
});