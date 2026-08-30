/**
 * POS/CASHIER SOCKET HANDLERS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Cashier (aur Owner/Manager) ko unke outlet ke POS room
 * mein join karata hai — jab Chef "READY" mark kare, isi room ko
 * `order:item_ready` event milega taaki Cashier/Waiter ko turant
 * pata chale serve karne ka time ho gaya.
 *
 * CONNECTED TO:
 * - sockets/index.ts    → connection event pe yeh call hota hai
 * - orders.controller.ts → item status READY hone pe isi room ko emit karta hai
 */

import type { Server, Socket } from "socket.io";

export function registerPosHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  if (["CASHIER", "OWNER", "MANAGER"].includes(user.role)) {
    const room = `outlet_${user.outletId}_pos`;
    socket.join(room);
  }
}