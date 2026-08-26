import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendError } from "../utils/api-response";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";

// Extend Express Request to carry authenticated user info
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, "No access token provided", 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET as string
    ) as AccessTokenPayload;

    req.user = payload;
    next();
  } catch (err) {
    return sendError(res, "Invalid or expired access token", 401);
  }
}