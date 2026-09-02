import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as authService from "./auth.service";
import { prisma } from "../../config/db";
import { REFRESH_TOKEN_COOKIE_NAME } from "../../utils/constants";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches REFRESH_TOKEN_EXPIRY
};

/**
 * USE CASE: Register karta hai — ab accessToken NAHI deta, sirf
 * userId return karta hai. Frontend isi userId ko verify-email
 * screen pe le jaayega aur OTP submit karte waqt use karega.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { userId, outlet } = await authService.registerOrganization(req.body);

  return sendSuccess(
    res,
    {
      userId,
      outlet: { id: outlet.id, name: outlet.name, slug: outlet.slug },
    },
    "OTP sent to your email. Please verify to continue.",
    201
  );
});

/** USE CASE: OTP verify karta hai — sahi hone pe login ho jaata hai (accessToken milta hai) */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { userId, otp } = req.body;
  const { accessToken, refreshToken, user } = await authService.verifyEmail(userId, otp);

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

  return sendSuccess(
    res,
    {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    },
    "Email verified successfully"
  );
});

/** USE CASE: Naya OTP bhejta hai agar purana expire ho gaya ho */
export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  await authService.resendOtp(req.body.userId);
  return sendSuccess(res, null, "OTP resent");
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(email, password);

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

  return sendSuccess(res, {
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: "No refresh token", data: null, error: null });
  }

  const accessToken = await authService.refreshAccessToken(refreshToken);
  return sendSuccess(res, { accessToken }, "Token refreshed");
});

export const createStaff = asyncHandler(async (req: Request, res: Response) => {
  const staff = await authService.createStaff(req.body, req.user!.role);

  return sendSuccess(
    res,
    { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    "Staff account created",
    201
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