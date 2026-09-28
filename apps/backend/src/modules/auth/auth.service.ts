import { prisma } from "../../config/db";
import { hashPassword, comparePassword } from "../../utils/password";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import {
  ACCESS_TOKEN_EXPIRY,
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  MAX_OTPS_PER_HOUR,
} from "../../utils/constants";
import type { RegisterOrganizationInput, CreateStaffInput } from "@cafe-pos/shared-schemas";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";
import { generateOtp, hashOtp, verifyOtp } from "../../utils/otp";
import { sendOtpEmail } from "../../utils/email";
import {
  issueRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from "./refresh-token.service";

// createStaff ab outletId body se nahi leta, JWT se leta hai
type CreateStaffBody = Omit<CreateStaffInput, "outletId">;
type Actor = { userId: string; role: string; outletId: string };

// Errors ke saath `code` bhi jaata hai, taaki frontend friendly message dikha sake
function httpError(message: string, statusCode: number, code?: string) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
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
 *
 * LEGAL: input.consentAcceptedAt already validated by RegisterOrganizationSchema
 * (must be a real, non-future ISO timestamp — see auth.schema.ts). We store it
 * directly on the Owner's User row AND write a matching AuditLog entry, so
 * there are two independent, timestamped records that notice was shown and
 * consent was obtained at the moment this account was created.
 */
export async function registerOrganization(input: RegisterOrganizationInput) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw httpError("Email already in use", 409, "EMAIL_IN_USE");
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.outletName);

  // Ensure slug uniqueness by appending a short random suffix if needed
  let slug = baseSlug;
  const slugExists = await prisma.outlet.findUnique({ where: { slug } });
  if (slugExists) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Organization + Outlet + Owner + OTP record + consent audit log — sab ek
  // hi transaction mein. Agar kahin bhi fail ho (jaise slug clash), sab
  // rollback ho jaayega, koi orphan user, OTP, ya audit record nahi bachega.
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
        consentAcceptedAt: new Date(input.consentAcceptedAt),
      },
    });

    // Separate audit-trail record, on top of the column above — belt and
    // braces. If the User row is ever edited/migrated later, this AuditLog
    // entry still stands as independent proof of when consent was captured.
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    await tx.emailVerification.create({
      data: {
        userId: owner.id,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    await tx.auditLog.create({
      data: {
        userId: owner.id,
        outletId: outlet.id,
        action: "CONSENT_ACCEPTED",
        metadata: {
          context: "registration",
          consentAcceptedAt: input.consentAcceptedAt,
          documents: ["privacy_policy", "terms_and_conditions"],
        },
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
 * USE CASE: OTP verify karta hai. Galat guesses DB mein count hote hain
 * (MAX_OTP_ATTEMPTS ke baad ye OTP dead), sahi hone par emailVerified true
 * hota hai aur tokens milte hain.
 */
export async function verifyEmail(userId: string, otp: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { outlet: true },
  });
  if (!user) throw httpError("User not found", 404, "USER_NOT_FOUND");
  if (user.emailVerified) throw httpError("Email already verified", 400, "ALREADY_VERIFIED");

  const latestOtp = await prisma.emailVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!latestOtp || latestOtp.expiresAt < new Date()) {
    throw httpError("OTP expired. Please request a new one.", 400, "OTP_EXPIRED");
  }
  if (latestOtp.attempts >= MAX_OTP_ATTEMPTS) {
    throw httpError("Too many wrong attempts. Please request a new OTP.", 429, "OTP_ATTEMPTS_EXCEEDED");
  }

  const isValid = await verifyOtp(otp, latestOtp.otpHash);
  if (!isValid) {
    await prisma.emailVerification.update({
      where: { id: latestOtp.id },
      data: { attempts: { increment: 1 } },
    });
    throw httpError("Invalid OTP", 400, "INVALID_OTP");
  }

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerified: true } }),
    prisma.emailVerification.deleteMany({ where: { userId } }), // use ho chuke OTPs saaf
  ]);

  const accessToken = generateAccessToken({
    userId: updatedUser.id,
    role: updatedUser.role,
    outletId: updatedUser.outletId,
    organizationId: user.outlet.organizationId,
  });
  const refreshToken = await issueRefreshToken(updatedUser.id);

  return { user: updatedUser, accessToken, refreshToken };
}

/**
 * USE CASE: Naya OTP bhejta hai, lekin 60 sec cooldown aur 1 ghante mein max
 * MAX_OTPS_PER_HOUR (pehla registration wala OTP bhi ginta hai). Isse resend
 * button se infinite fresh attempts nahi milte.
 */
export async function resendOtp(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError("User not found", 404, "USER_NOT_FOUND");
  if (user.emailVerified) throw httpError("Email already verified", 400, "ALREADY_VERIFIED");

  const recent = await prisma.emailVerification.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recent.length >= MAX_OTPS_PER_HOUR) {
    throw httpError("Too many OTP requests. Please try again after some time.", 429, "OTP_RESEND_LIMIT");
  }
  if (recent[0]) {
    const elapsed = Date.now() - recent[0].createdAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw httpError(`Please wait ${wait} seconds before requesting another OTP.`, 429, "OTP_RESEND_COOLDOWN");
    }
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  await prisma.emailVerification.create({
    data: { userId, otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  await sendOtpEmail(user.email, user.name, otp);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { outlet: true }, // ek hi query mein organizationId bhi
  });

  if (!user) throw httpError("Invalid email or password", 401, "INVALID_CREDENTIALS");

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) throw httpError("Invalid email or password", 401, "INVALID_CREDENTIALS");

  // Password sahi hone ke BAAD check karte hain, taaki koi bhi random email
  // daal ke pata na laga sake ki kaunsa account exist karta hai
  if (!user.isActive) {
    throw httpError(
      "Your account has been deactivated. Please contact your outlet owner.",
      403,
      "ACCOUNT_DEACTIVATED"
    );
  }

  if (!user.emailVerified) {
    const err = httpError("Please verify your email first", 403, "EMAIL_NOT_VERIFIED");
    err.userId = user.id; // frontend resend-otp ke liye use karega
    throw err;
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: user.outlet.organizationId,
  });
  const refreshToken = await issueRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(rawRefreshToken: string) {
  const record = await findValidRefreshToken(rawRefreshToken);
  if (!record) throw httpError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    include: { outlet: true },
  });
  if (!user || !user.isActive) {
    throw httpError("User not found or inactive", 401, "REFRESH_TOKEN_INVALID");
  }

  return generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: user.outlet.organizationId,
  });
}

/** USE CASE: Logout — is device ka refresh token dead kar deta hai */
export async function logout(rawRefreshToken: string) {
  await revokeRefreshToken(rawRefreshToken);
}

/**
 * USE CASE: Owner/Manager naya staff banata hai. outletId hamesha creator ke
 * JWT se aata hai, body se nahi, warna ek outlet ka Owner doosre outlet mein
 * staff bana sakta tha.
 */
export async function createStaff(input: CreateStaffBody, actor: Actor) {
  if (input.role === "MANAGER" && actor.role !== "OWNER") {
    throw httpError("Only the Owner can create a Manager account", 403, "OWNER_ONLY");
  }

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) throw httpError("Email already in use", 409, "EMAIL_IN_USE");

  const passwordHash = await hashPassword(input.password);

  const staff = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      outletId: actor.outletId, // ← JWT se, body se nahi
      emailVerified: true,
      // consentAcceptedAt intentionally null, dekho auth.schema.ts ka TODO
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      outletId: actor.outletId,
      action: "CREATE_STAFF",
      metadata: { staffId: staff.id, role: staff.role },
    },
  });

  return staff;
}

/**
 * USE CASE: Staff deactivate/reactivate. Deactivate hone par saare refresh
 * tokens revoke ho jaate hain (naya access token nahi mil sakta). Rules:
 * apne aap ko nahi, Owner ko nahi, Manager ko sirf Owner.
 */
export async function setStaffActive(staffId: string, isActive: boolean, actor: Actor) {
  if (staffId === actor.userId) {
    throw httpError("You cannot change your own account status", 400, "SELF_STATUS_CHANGE");
  }

  const staff = await prisma.user.findFirst({
    where: { id: staffId, outletId: actor.outletId }, // outlet-scoped
  });
  if (!staff) throw httpError("Staff member not found", 404, "STAFF_NOT_FOUND");

  if (staff.role === "OWNER") {
    throw httpError("The Owner account cannot be deactivated", 403, "OWNER_PROTECTED");
  }
  if (staff.role === "MANAGER" && actor.role !== "OWNER") {
    throw httpError("Only the Owner can change a Manager's status", 403, "OWNER_ONLY");
  }

  const updated = await prisma.user.update({
    where: { id: staffId },
    data: { isActive },
  });

  if (!isActive) await revokeAllRefreshTokens(staffId);

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      outletId: actor.outletId,
      action: isActive ? "REACTIVATE_STAFF" : "DEACTIVATE_STAFF",
      metadata: { staffId, role: staff.role },
    },
  });

  return updated;
}

/**
 * USE CASE: Outlet ke saare staff members list karta hai — Setup checklist
 * aur future Staff List screen dono use karenge.
 */
export async function getStaffList(outletId: string) {
  return prisma.user.findMany({
    where: { outletId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}