/**
 * SOCKET AUTH
 * ─────────────────────────────────────────────────────────
 * USE CASE: Socket.io handshake pe JWT verify karta hai — HTTP
 * routes ki tarah, real-time connections bhi authenticated hone
 * chahiye, warna koi bhi bina login KDS/POS events sun sakta tha.
 *
 * CONNECTED TO:
 * - config/env.ts   → JWT secret yahan se aata hai
 * - sockets/index.ts → `io.use(socketAuth)` se attach hota hai
 * - shared-types     → AccessTokenPayload shape
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Socket } from "socket.io";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";

export function socketAuth(socket: Socket, next: (err?: Error) => void) {
  // Mobile app connection banate waqt token isme bhejega:
  // io(url, { auth: { token: accessToken } })
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("No auth token provided"));
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    socket.data.user = payload; // baaki sockets files isko `socket.data.user` se padhengi
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}