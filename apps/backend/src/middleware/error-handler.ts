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

  return sendError(res, message, statusCode);
}