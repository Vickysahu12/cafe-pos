/**
 * KDS SOCKET HANDLERS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Chef (aur Owner/Manager, monitoring ke liye) ko unke
 * outlet ke KDS room mein join karata hai. Room-per-outlet pattern
 * isliye zaroori hai kyunki multi-outlet system hai — Outlet A ka
 * Chef, Outlet B ke orders nahi dekhna chahiye.
 *
 * CONNECTED TO:
 * - sockets/index.ts    → connection event pe yeh call hota hai
 * - orders.controller.ts → order create/update hone pe isi room ko emit karta hai
 */

import type { Server, Socket } from "socket.io";

export function registerKdsHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  if (["CHEF", "OWNER", "MANAGER"].includes(user.role)) {
    const room = `outlet_${user.outletId}_kds`;
    socket.join(room);
  }
}