/**
 * REFRESH TOKEN SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Refresh tokens ko DB mein track karta hai taaki unhe REVOKE
 * kiya ja sake (logout, staff deactivate). Token random string hai; DB mein
 * sirf uska HMAC hash jaata hai, isliye DB leak hone par bhi token use nahi
 * ho sakta.
 *
 * CONNECTED TO:
 * - auth.service.ts  → login/verifyEmail issue karte hain, refresh/logout use karte hain
 * - config/env.ts    → JWT_REFRESH_SECRET hash ki key hai (isse casually rotate mat karna,
 *                      sab sessions invalid ho jayenge)
 * - schema.prisma    → RefreshToken model
 */

import crypto from "crypto";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { REFRESH_TOKEN_TTL_MS } from "../../utils/constants";

function hashToken(raw: string): string {
  return crypto.createHmac("sha256", env.JWT_REFRESH_SECRET).update(raw).digest("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

export async function findValidRefreshToken(raw: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function revokeRefreshToken(raw: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}