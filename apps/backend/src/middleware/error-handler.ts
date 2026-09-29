import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { sendError } from "../utils/api-response";
import { logger } from "../config/logger";
import { env } from "../config/env";

/**
 * FIX (2026-09-29): pehle har error ka `err.message` seedha client ko jaata
 * tha — 500 errors mein iska matlab tha Prisma ke internal messages (table
 * names, query details) API response mein leak hote the. Ab:
 * - Humare apne errors (jin pe `statusCode` set hai, jaise 404/409) ka message
 *   pehle jaisa hi jaata hai — frontend unhe dikhata hai.
 * - Prisma ke known errors ko sahi status mein map karte hain (duplicate → 409,
 *   record gayab → 404) bina internal detail ke.
 * - Baaki sab unknown 500 errors production mein generic message dete hain;
 *   poori detail sirf server log mein jaati hai.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Prisma known errors → saaf HTTP errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn(`Prisma ${err.code}: ${err.message}`, { path: req.path });
    if (err.code === "P2002") {
      return sendError(res, "This record already exists", 409, { code: "DUPLICATE" });
    }
    if (err.code === "P2025") {
      return sendError(res, "Record not found", 404, { code: "NOT_FOUND" });
    }
    if (err.code === "P2003") {
      return sendError(res, "Related record not found", 400, { code: "INVALID_REFERENCE" });
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn(`Prisma validation error: ${err.message}`, { path: req.path });
    return sendError(res, "Invalid request data", 400, { code: "INVALID_INPUT" });
  }

  // express.json() ka malformed JSON error (body-parser `status` set karta hai)
  if (err.type === "entity.parse.failed") {
    return sendError(res, "Malformed JSON body", 400, { code: "INVALID_JSON" });
  }
  if (err.type === "entity.too.large") {
    return sendError(res, "Request body too large", 413, { code: "PAYLOAD_TOO_LARGE" });
  }
  if (err.message === "Not allowed by CORS") {
    return sendError(res, "Origin not allowed", 403, { code: "CORS_BLOCKED" });
  }

  const statusCode = err.statusCode || 500;
  // `expose: true` wale 5xx errors humne khud jaan-bujh ke banaye hain (jaise
  // EMAIL_SEND_FAILED) — unka message/code user ko dikhana safe hai
  const isServerError = statusCode >= 500 && !err.expose;

  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.path });
  }

  const message =
    isServerError && env.NODE_ENV === "production"
      ? "Something went wrong. Please try again."
      : err.message || "Internal Server Error";

  // Forward structured error fields for frontend consumption
  // code → friendly error type (e.g. "OTP_EXPIRED", "ACCOUNT_DEACTIVATED")
  // userId → needed by frontend for resend-OTP flow on EMAIL_NOT_VERIFIED
  const errorData: Record<string, unknown> = {};
  if (err.code && !isServerError) errorData.code = err.code;
  if (err.userId) errorData.userId = err.userId;

  return sendError(
    res,
    message,
    statusCode,
    Object.keys(errorData).length ? errorData : null
  );
}
