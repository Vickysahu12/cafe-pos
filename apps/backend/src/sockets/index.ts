/**
 * SOCKET.IO BOOTSTRAP
 * ─────────────────────────────────────────────────────────
 * USE CASE: Socket.io server ko HTTP server pe attach karta hai,
 * auth middleware lagata hai, aur connection aane pe KDS/POS room
 * handlers register karta hai. `getIO()` ek singleton getter hai —
 * orders.controller.ts isse events emit karne ke liye use karega,
 * bina server.ts ko baar-baar import kiye.
 *
 * CONNECTED TO:
 * - server.ts         → `initSocketIO(httpServer)` yahan se call hota hai
 * - socket-auth.ts     → connection se pehle JWT verify
 * - kds.socket.ts, pos.socket.ts → room-join logic
 * - orders.controller.ts → `getIO()` se events emit karta hai
 */
import { env } from "../config/env";
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { socketAuth } from "./socket-auth";
import { registerKdsHandlers } from "./kds.socket";
import { registerPosHandlers } from "./pos.socket";
import { logger } from "../config/logger";

let io: SocketIOServer | null = null;

// Mobile app ki tarah web clients (customer QR, future admin dashboard)
// Origin header bhejte hain — unhe env ki whitelist se check karte hain.
// Native mobile socket client Origin hi nahi bhejta, isliye woh case
// (origin undefined) allow rehta hai.
const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: false, // cookies use nahi ho rahi, refresh token body mein jaata hai
    },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}, role: ${socket.data.user?.role}`);

    registerKdsHandlers(io!, socket);
    registerPosHandlers(io!, socket);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** USE CASE: Kisi bhi module se io instance chahiye ho, isse lo — server.ts ko dobara import nahi karna padta */
export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialized — did you forget to call initSocketIO()?");
  return io;
}