import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { sendError } from "../utils/api-response";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const firstError = result.error.errors[0];
      return sendError(
        res,
        firstError.message || "Validation failed",
        400,
        result.error.flatten()
      );
    }

    req.body = result.data;
    next();
  };
}