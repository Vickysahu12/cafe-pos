/**
 * SOCKET AUTH
 * ─────────────────────────────────────────────────────────
 * USE CASE: Socket.io handshake pe JWT verify karta hai, aur DB se check
 * karta hai ki account abhi bhi active hai (deactivated staff naya socket
 * connection nahi bana sakta).
 *
 * CONNECTED TO:
 * - config/env.ts, config/db.ts
 * - sockets/index.ts → `io.use(socketAuth)`
 * - auth.controller.ts → deactivate par live sockets disconnect karta hai
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/db";
import type { Socket } from "socket.io";
import type { AccessTokenPayload } from "@cafe-pos/shared-types";

export async function socketAuth(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No auth token provided"));

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    return next(new Error("Invalid or expired token"));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true },
    });
    if (!user || !user.isActive) return next(new Error("Account deactivated"));
  } catch {
    return next(new Error("Authentication failed, please try again"));
  }

  socket.data.user = payload;
  next();
}