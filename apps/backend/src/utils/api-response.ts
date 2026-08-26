import { Response } from "express";

export function sendSuccess(
  res: Response,
  data: unknown,
  message: string = "Success",
  statusCode: number = 200
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  error: unknown = null
) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error,
  });
}