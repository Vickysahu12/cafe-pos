import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/api-response";
import { logger } from "../config/logger";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Forward structured error fields for frontend consumption
  // code → friendly error type (e.g. "OTP_EXPIRED", "ACCOUNT_DEACTIVATED")
  // userId → needed by frontend for resend-OTP flow on EMAIL_NOT_VERIFIED
  const errorData: Record<string, unknown> = {};
  if (err.code) errorData.code = err.code;
  if (err.userId) errorData.userId = err.userId;

  return sendError(
    res,
    message,
    statusCode,
    Object.keys(errorData).length ? errorData : null
  );
}