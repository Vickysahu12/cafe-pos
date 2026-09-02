import { prisma } from "../../config/db";
import { hashPassword, comparePassword } from "../../utils/password";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY } from "../../utils/constants";
import type { RegisterOrganizationInput, CreateStaffInput } from "@cafe-pos/shared-schemas";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";
import { generateOtp, hashOtp, verifyOtp } from "../../utils/otp";
import { sendOtpEmail } from "../../utils/email";

function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

// Slug helper — turns "Sharma Cafe" into "sharma-cafe"
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * USE CASE: Organization + Outlet + Owner banata hai, but ab accessToken
 * turant NAHI deta — Owner ka email verify hone tak login possible nahi
 * hai. OTP generate karke email par bhejta hai, aur sirf userId return
 * karta hai taaki frontend verify-email screen pe le jaaye.
 */
export async function registerOrganization(input: RegisterOrganizationInput) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const err: any = new Error("Email already in use");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.outletName);

  // Ensure slug uniqueness by appending a short random suffix if needed
  let slug = baseSlug;
  const slugExists = await prisma.outlet.findUnique({ where: { slug } });
  if (slugExists) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Organization + Outlet + Owner + OTP record — sab ek hi transaction mein.
  // Agar kahin bhi fail ho (jaise slug clash), sab rollback ho jaayega,
  // koi orphan user ya OTP record nahi bachega.
  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName },
    });

    const outlet = await tx.outlet.create({
      data: {
        name: input.outletName,
        slug,
        address: input.outletAddress,
        phone: input.phone,
        organizationId: organization.id,
      },
    });

    const owner = await tx.user.create({
      data: {
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: "OWNER",
        outletId: outlet.id,
        emailVerified: false,
      },
    });

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    await tx.emailVerification.create({
      data: {
        userId: owner.id,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    return { organization, outlet, owner, otp };
  });

  // Email transaction ke BAHAR bhejte hain — agar network fail ho toh
  // bhi user/OTP record DB mein rahega, resend-otp se recover ho sakta hai
  await sendOtpEmail(result.owner.email, result.owner.name, result.otp);

  // NOTE: koi accessToken/refreshToken yahan nahi — verify hone tak login nahi milega
  return { userId: result.owner.id, outlet: result.outlet };
}

/**
 * USE CASE: OTP verify karta hai. Sahi hone pe emailVerified true karta
 * hai AUR turant accessToken/refreshToken deta hai — verification hi
 * effectively login step ban jaata hai, alag se dobara login nahi karna padta.
 */
export async function verifyEmail(userId: string, otp: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err: any = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  if (user.emailVerified) {
    const err: any = new Error("Email already verified");
    err.statusCode = 400;
    throw err;
  }

  const latestOtp = await prisma.emailVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp || latestOtp.expiresAt < new Date()) {
    const err: any = new Error("OTP expired. Please request a new one.");
    err.statusCode = 400;
    throw err;
  }

  const isValid = await verifyOtp(otp, latestOtp.otpHash);
  if (!isValid) {
    const err: any = new Error("Invalid OTP");
    err.statusCode = 400;
    throw err;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  });

  const outlet = await prisma.outlet.findUnique({ where: { id: updatedUser.outletId } });

  const accessToken = generateAccessToken({
    userId: updatedUser.id,
    role: updatedUser.role,
    outletId: updatedUser.outletId,
    organizationId: outlet!.organizationId,
  });
  const refreshToken = generateRefreshToken(updatedUser.id);

  return { user: updatedUser, accessToken, refreshToken };
}

/**
 * USE CASE: Naya OTP generate karke bhejta hai — agar purana expire
 * ho gaya ho ya mail miss ho gaya ho.
 */
export async function resendOtp(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err: any = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  if (user.emailVerified) {
    const err: any = new Error("Email already verified");
    err.statusCode = 400;
    throw err;
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  await prisma.emailVerification.create({
    data: { userId, otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  await sendOtpEmail(user.email, user.name, otp);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    const err: any = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    const err: any = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  // NAYA CHECK — email verify na ho toh login block karo
  if (!user.emailVerified) {
    const err: any = new Error("Please verify your email first");
    err.statusCode = 403;
    err.userId = user.id; // frontend ko batane ke liye resend-otp kis user ke liye karna hai
    throw err;
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: (await prisma.outlet.findUnique({ where: { id: user.outletId } }))!.organizationId,
  });
  const refreshToken = generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: { userId: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    const err: any = new Error("Invalid or expired refresh token");
    err.statusCode = 401;
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { outlet: true },
  });

  if (!user || !user.isActive) {
    const err: any = new Error("User not found or inactive");
    err.statusCode = 401;
    throw err;
  }

  return generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: user.outlet.organizationId,
  });
}

export async function createStaff(input: CreateStaffInput, createdByRole: string) {
  // Only Owner/Manager can call this (enforced at route level), but Manager
  // additionally cannot create another Manager — only Owner can
  if (input.role === "MANAGER" && createdByRole !== "OWNER") {
    const err: any = new Error("Only the Owner can create a Manager account");
    err.statusCode = 403;
    throw err;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const err: any = new Error("Email already in use");
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);

  const staff = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      outletId: input.outletId,
    },
  });

  return staff;
}