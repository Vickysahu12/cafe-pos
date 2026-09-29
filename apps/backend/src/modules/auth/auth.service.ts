import crypto from "crypto";
import { Prisma, type OtpPurpose } from "@prisma/client";
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
import { logger } from "../../config/logger";
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
// FIX (2026-09-29): 40 chars tak cap (bahut lamba naam = bahut lamba QR URL)
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
}

// FIX (2026-09-29): emails hamesha lowercase + trimmed store/compare hote hain
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
  // FIX (2026-09-29): email lowercase + trim — pehle "Owner@Cafe.com" aur
  // "owner@cafe.com" do alag accounts ban sakte the, aur login case-sensitive tha
  const email = normalizeEmail(input.email);

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // FIX (2026-09-29): "EMAIL LOCK" BUG. Pehle agar koi kisi ka email daal ke
  // register kar de aur verify na kare (ya OTP email fail ho jaye), to asli
  // owner us email se KABHI register nahi kar pata tha — hamesha "Email already
  // in use". Ab: agar existing account UNVERIFIED Owner hai, to uska adhoora
  // organization (outlet + user + OTP, cascade) hata ke fresh registration hoti
  // hai. Safe hai kyunki unverified owner login hi nahi kar sakta, to us org mein
  // registration ke alawa koi data ho hi nahi sakta. Verified accounts ko chhedte nahi.
  let staleOrganizationId: string | null = null;
  if (existingUser) {
    if (existingUser.emailVerified || existingUser.role !== "OWNER") {
      throw httpError("Email already in use", 409, "EMAIL_IN_USE");
    }
    const staleOutlet = await prisma.outlet.findUnique({
      where: { id: existingUser.outletId },
      select: { organizationId: true },
    });
    staleOrganizationId = staleOutlet?.organizationId ?? null;
  }

  const passwordHash = await hashPassword(input.password);

  // FIX (2026-09-29): slug bugs. Pehle: (a) sirf Hindi/non-English naam
  // ("चाय कैफे") pe slugify "" deta tha → QR URL toot jaata; (b) check-then-insert
  // race — do log ek hi naam se ek saath register karein to ek ko 500 crash;
  // (c) suffix wala slug dobara check nahi hota tha.
  // Ab: pehli try saaf slug ("sharma-cafe"); agar DB unique-constraint (P2002)
  // de to random 6-hex suffix ke saath retry (16^6 ≈ 1.6 crore combos per naam).
  const cleanSlug = slugify(input.outletName);
  const baseSlug = cleanSlug || "cafe";

  // Organization + Outlet + Owner + OTP record + consent audit log — sab ek
  // hi transaction mein. Agar kahin bhi fail ho (jaise slug clash), sab
  // rollback ho jaayega, koi orphan user, OTP, ya audit record nahi bachega.
  const runRegistration = (slug: string) => prisma.$transaction(async (tx) => {
    if (staleOrganizationId && existingUser) {
      // audit_logs.userId FK "ON DELETE RESTRICT" hai — isliye pehle us adhoore
      // account ke audit rows (sirf uska CONSENT_ACCEPTED) hatao, warna org delete
      // fail hoga. Naya registration apna fresh consent record likhta hai neeche.
      await tx.auditLog.deleteMany({ where: { userId: existingUser.id } });
      await tx.organization.delete({ where: { id: staleOrganizationId } });
    }

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
        email,
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

  const newSlug = () => `${baseSlug}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;
  let result: Awaited<ReturnType<typeof runRegistration>> | undefined;
  // Attempt 1: saaf slug (sirf agar naam se bana ho). Attempts 2-3: random suffix.
  const slugAttempts = [cleanSlug || newSlug(), newSlug(), newSlug()];
  for (let i = 0; i < slugAttempts.length && !result; i++) {
    try {
      result = await runRegistration(slugAttempts[i]);
    } catch (err) {
      // P2002 = unique constraint (slug ya email race) — naye slug ke saath retry.
      // Agar email race tha (do requests same email se), har retry P2002 dega aur
      // aakhri baar error-handler usse 409 bana dega.
      const isUniqueClash =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueClash || i === slugAttempts.length - 1) throw err;
    }
  }
  if (!result) throw httpError("Registration failed, please try again", 500);

  // Email transaction ke BAHAR bhejte hain — agar network fail ho toh
  // bhi user/OTP record DB mein rahega. FIX (2026-09-29): ab agar email fail ho,
  // user dobara register kar sakta hai (upar wala unverified-owner reset
  // isi case ko handle karta hai) — pehle woh hamesha ke liye atak jaata tha.
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

  await checkOtp(userId, "EMAIL_VERIFY", otp);

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

  await assertCanSendOtp(userId, "EMAIL_VERIFY");
  const otp = await createOtp(userId, "EMAIL_VERIFY");
  await sendOtpEmail(user.email, user.name, otp);
}

// ─────────────────────────────────────────────────────────
// FIX (2026-09-29): OTP helpers — verifyEmail/resendOtp mein jo logic inline
// tha, ab password-reset bhi wahi use karta hai. `purpose` filter zaroori hai:
// warna reset ka OTP email-verify mein (ya ulta) chal jaata.
// ─────────────────────────────────────────────────────────

/** 60 sec cooldown + ghante mein max MAX_OTPS_PER_HOUR — dono purposes alag gine jaate hain */
async function assertCanSendOtp(userId: string, purpose: OtpPurpose) {
  const recent = await prisma.emailVerification.findMany({
    where: { userId, purpose, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
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
}

/** Naya OTP banata hai (hashed store), plain OTP return karta hai email ke liye */
async function createOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  await prisma.emailVerification.create({
    data: { userId, otpHash, purpose, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  return otp;
}

/** Latest OTP check — expiry, MAX_OTP_ATTEMPTS, galat guess pe attempts++ */
async function checkOtp(userId: string, purpose: OtpPurpose, otp: string) {
  const latestOtp = await prisma.emailVerification.findFirst({
    where: { userId, purpose },
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
}

export async function login(email: string, password: string) {
  // FIX (2026-09-29): case-insensitive match — "Owner@Cafe.com" type karne pe bhi
  // login ho. `insensitive` isliye (normalize ke bajaye) taaki purane accounts jo
  // mixed-case email se bane the, woh bhi kaam karte rahein.
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
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

  // FIX (2026-09-29): email normalize + case-insensitive duplicate check
  const email = normalizeEmail(input.email);
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existingUser) throw httpError("Email already in use", 409, "EMAIL_IN_USE");

  const passwordHash = await hashPassword(input.password);

  const staff = await prisma.user.create({
    data: {
      name: input.name,
      email,
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
  const staff = await findManageableStaff(staffId, actor);

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

/**
 * FIX (2026-09-29): setStaffActive ke permission rules ab ek helper mein —
 * resetStaffPassword bhi bilkul yahi rules use karta hai:
 * apne aap pe nahi, Owner pe kabhi nahi, Manager pe sirf Owner, sirf apna outlet.
 */
async function findManageableStaff(staffId: string, actor: Actor) {
  if (staffId === actor.userId) {
    throw httpError("You cannot do this on your own account", 400, "SELF_ACTION");
  }

  const staff = await prisma.user.findFirst({
    where: { id: staffId, outletId: actor.outletId }, // outlet-scoped
  });
  if (!staff) throw httpError("Staff member not found", 404, "STAFF_NOT_FOUND");

  if (staff.role === "OWNER") {
    throw httpError("The Owner account cannot be changed by staff", 403, "OWNER_PROTECTED");
  }
  if (staff.role === "MANAGER" && actor.role !== "OWNER") {
    throw httpError("Only the Owner can change a Manager's account", 403, "OWNER_ONLY");
  }
  return staff;
}

// ─────────────────────────────────────────────────────────
// FIX (2026-09-29): PASSWORD RESET
// Pehle password bhoolne ka koi raasta nahi tha — Owner hamesha ke liye locked
// out, aur app "contact your Owner" bolta tha jabki Owner ke paas bhi staff ka
// password reset karne ka option nahi tha.
// ─────────────────────────────────────────────────────────

/**
 * USE CASE: "Forgot password?" step 1 — email pe 6-digit OTP bhejta hai.
 * SECURITY: response HAMESHA same hota hai (account ho ya na ho), taaki koi is
 * endpoint se pata na laga sake ki kaunsa email registered hai (enumeration).
 * Isliye cooldown/limit/email errors bhi user ko nahi bataate, sirf log karte hain.
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
  });
  // Unverified owner ka email kabhi prove hi nahi hua — unhe dobara register karna chahiye
  if (!user || !user.isActive || !user.emailVerified) return;

  try {
    await assertCanSendOtp(user.id, "PASSWORD_RESET");
    const otp = await createOtp(user.id, "PASSWORD_RESET");
    await sendOtpEmail(user.email, user.name, otp, "PASSWORD_RESET");
  } catch (err: any) {
    // Chupchaap — generic response hi jaayega (dekho upar SECURITY note)
    logger.warn(`Password reset OTP not sent for user ${user.id}: ${err?.code ?? err?.message}`);
  }
}

/**
 * USE CASE: "Forgot password?" step 2 — OTP + naya password. Success pe:
 * password update, reset OTPs saaf, aur SAARE devices ke refresh tokens revoke
 * (agar kisi ne password chura ke login kiya tha, woh bhi bahar ho jaaye).
 */
export async function resetPassword(email: string, otp: string, newPassword: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
  });
  // Generic error — account exist karta hai ya nahi, yeh leak nahi karte
  if (!user || !user.isActive || !user.emailVerified) {
    throw httpError("Invalid or expired code. Please request a new one.", 400, "INVALID_OTP");
  }

  await checkOtp(user.id, "PASSWORD_RESET", otp);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.emailVerification.deleteMany({ where: { userId: user.id, purpose: "PASSWORD_RESET" } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: { userId: user.id, outletId: user.outletId, action: "PASSWORD_RESET", metadata: { via: "email_otp" } },
    }),
  ]);
  return { userId: user.id };
}

/**
 * USE CASE: Logged-in user apna password badle (Settings → Change password).
 * Baaki saare devices logout ho jaate hain; is device ko naye tokens milte hain.
 */
export async function changePassword(actor: Actor, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, include: { outlet: true } });
  if (!user || !user.isActive) throw httpError("Account not found", 404, "USER_NOT_FOUND");

  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) throw httpError("Current password is incorrect", 400, "WRONG_PASSWORD");

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: { userId: user.id, outletId: user.outletId, action: "PASSWORD_CHANGED", metadata: {} },
    }),
  ]);

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
    outletId: user.outletId,
    organizationId: user.outlet.organizationId,
  });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}

/**
 * USE CASE: Owner/Manager kisi staff ka password set kare — cashier/chef ke
 * paas aksar asli email nahi hota (Owner ne account banaya tha), to woh khud
 * "forgot password" nahi kar sakte. Staff ke saare devices logout ho jaate hain.
 */
export async function resetStaffPassword(staffId: string, newPassword: string, actor: Actor) {
  const staff = await findManageableStaff(staffId, actor);
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: staff.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: staff.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: actor.userId,
        outletId: actor.outletId,
        action: "RESET_STAFF_PASSWORD",
        metadata: { staffId: staff.id, role: staff.role },
      },
    }),
  ]);
  return { id: staff.id };
}

/**
 * FIX (2026-09-30): staff ka apna consent (DPDP). Idempotent — pehle se accept
 * kiya ho to wahi purana timestamp return, dobara audit entry nahi.
 */
export async function recordConsent(actor: Actor) {
  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) throw httpError("Account not found", 404, "USER_NOT_FOUND");
  if (user.consentAcceptedAt) return user.consentAcceptedAt;

  const consentAcceptedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { consentAcceptedAt } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        outletId: user.outletId,
        action: "CONSENT_ACCEPTED",
        metadata: {
          context: "first_login",
          consentAcceptedAt: consentAcceptedAt.toISOString(),
          documents: ["privacy_policy", "terms_and_conditions"],
        },
      },
    }),
  ]);
  return consentAcceptedAt;
}

// ─────────────────────────────────────────────────────────
// FIX (2026-09-29): ACCOUNT DELETION (Google Play mandatory + DPDP "right to erasure")
// ─────────────────────────────────────────────────────────

/**
 * USE CASE: Owner apna account delete kare → poori organization ka data
 * PERMANENTLY delete: saare outlets, staff, menu, orders, inventory, audit logs.
 * Password dobara maangte hain (chori ke phone se koi delete na kar de).
 *
 * Returns: deleted users ki ids — controller unke live sockets kaatta hai.
 *
 * NOTE: audit_logs.userId aur order_items.productId FKs "RESTRICT" hain, isliye
 * organization delete (cascade) se PEHLE unhe explicitly hatana padta hai.
 */
export async function deleteOwnerAccount(actor: Actor, password: string) {
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, include: { outlet: true } });
  if (!user) throw httpError("Account not found", 404, "USER_NOT_FOUND");
  if (user.role !== "OWNER") {
    throw httpError("Only the Owner can delete the cafe account", 403, "OWNER_ONLY");
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) throw httpError("Password is incorrect", 400, "WRONG_PASSWORD");

  const organizationId = user.outlet.organizationId;
  const outlets = await prisma.outlet.findMany({ where: { organizationId }, select: { id: true } });
  const outletIds = outlets.map((o) => o.id);
  const users = await prisma.user.findMany({ where: { outletId: { in: outletIds } }, select: { id: true } });

  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { outletId: { in: outletIds } } }),
    prisma.orderItem.deleteMany({ where: { order: { outletId: { in: outletIds } } } }),
    prisma.organization.delete({ where: { id: organizationId } }), // baaki sab cascade
  ]);

  logger.info(`Organization ${organizationId} deleted by owner ${user.id} (${outletIds.length} outlets, ${users.length} users)`);
  return { deletedUserIds: users.map((u) => u.id) };
}