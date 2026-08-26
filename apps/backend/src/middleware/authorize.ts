import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/api-response";

export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, "Not authenticated", 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Required role: ${allowedRoles.join(" or ")}`,
        403
      );
    }

    next();
  };
}