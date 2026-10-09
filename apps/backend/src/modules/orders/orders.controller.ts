/**
 * ORDERS CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer + Socket.io emit karne ki jagah. Order
 * create/update hone ke baad, yahi se KDS/POS rooms ko real-time
 * event bhejte hain — service layer khud sockets nahi jaanta
 * (separation of concerns), controller hi orchestration karta hai.
 *
 * FIX: pehle createOrder sirf KDS room ko emit karta tha — matlab
 * naya order banते hi Chef ko turant pata chal jaata tha, lekin
 * Cashier/Owner (POS room) ko kabhi nahi, jab tak wo screen refresh
 * na karein. Ab har lifecycle event dono rooms ko jaata hai jaha
 * jaha wo genuinely relevant hai.
 *
 * CONNECTED TO:
 * - orders.service.ts  → business logic
 * - sockets/index.ts    → getIO() se events emit
 * - orders.routes.ts     → yeh handlers routes se attach hote hain
 */

import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess, sendError } from "../../utils/api-response";
import * as ordersService from "./orders.service";
import { getIO } from "../../sockets";
import { forRole, withoutCustomerPhone } from "./customer-privacy";
// NOTE (2026-10-06): Owner/Manager dono rooms (kds + pos) mein hote hain. Pehle `to([kds, pos])`
// ek hi baar bhejta tha; ab do alag emits hain, isliye KDS wala `.except(pos)` — warna
// Owner ke phone pe har event DO baar (double new-order chime). Owner ko full (phone ke saath)
// pos wala milta hai, Chef ko sirf kds wala (bina phone).

function rooms(outletId: string) {
  return {
    kds: `outlet_${outletId}_kds`,
    pos: `outlet_${outletId}_pos`,
  };
}

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  // FIX (2026-10-09): ab Owner/Manager bhi app se bill karte hain (admin "Bill" tab). Pehle sirf
  // CASHIER ka id save hota tha — Owner ka order `cashierId: null` banta, jo QR (customer) order
  // ka nishaan hai → app/KDS pe galat "QR" badge. Ab jo bhi staff login se bill kare, uska id.
  // null sirf public QR route (public-menu) se aata hai.
  const cashierId = req.user!.userId;

  const order = await ordersService.createOrder(req.body, outletId, cashierId);

  // Real-time: BOTH the Chef's KDS and the Cashier/Owner's POS view need to
  // know the instant an order is created — whether it came from a Cashier's
  // own billing screen or a customer's QR order, both sides should see it
  // without refreshing.
  // FIX (2026-10-06): customer ka PHONE kitchen (KDS) ko nahi — dekho customer-privacy.ts
  const { kds, pos } = rooms(outletId);
  getIO().to(kds).except(pos).emit("order:created", { order: withoutCustomerPhone(order), outletId });
  getIO().to(pos).emit("order:created", { order, outletId });

  return sendSuccess(res, order, "Order created", 201);
});

// FIX (2026-09-29): query params ab Zod se validate hote hain. Pehle
// `?orderStatus=abc` ya `?dateFrom=kal` jaisi galat value seedha Prisma tak
// jaati thi → 500 crash + internal Prisma error message client ko leak hota tha.
// Ab galat value pe saaf 400 milta hai.
const GetOrdersQuerySchema = z.object({
  orderStatus: z.enum(["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PAID", "PARTIAL", "REFUNDED"]).optional(),
  tableId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(ordersService.MAX_ORDERS_LIMIT).optional(),
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const parsed = GetOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, "Invalid filter values", 400, parsed.error.flatten());
  }
  const orders = await ordersService.getOrders(req.user!.outletId, parsed.data);
  // FIX (2026-10-06): Chef ko customer phone nahi (sirf naam)
  return sendSuccess(res, orders.map((o) => forRole(o, req.user!.role)));
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const order = await ordersService.getOrderById(req.params.id as string, req.user!.outletId);
  return sendSuccess(res, forRole(order, req.user!.role)); // FIX (2026-10-06): Chef ko phone nahi
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const order = await ordersService.updateOrderStatus(req.params.id as string, outletId, req.body);

  // This covers Chef's "Mark Order Ready" action (whole order → READY) and
  // any other order-level status change. POS needs it to enable "Serve";
  // KDS needs it too so a second Chef device (or Owner monitoring the KDS)
  // clears the order from its active list in real time as well.
  // FIX (2026-10-06): KDS ko bina customer phone (customer-privacy.ts)
  const { kds, pos } = rooms(outletId);
  getIO().to(kds).except(pos).emit("order:updated", { order: withoutCustomerPhone(order), outletId });
  getIO().to(pos).emit("order:updated", { order, outletId });

  return sendSuccess(res, order, "Order status updated");
});

export const updateOrderItemStatus = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const item = await ordersService.updateOrderItemStatus(
    req.params.id as string,
    req.params.itemId as string,
    outletId,
    req.body.status
  );

  const { kds, pos } = rooms(outletId);

  // Every item-level status change goes to KDS — this keeps a second Chef
  // device (or Owner monitoring the board) in sync even for PENDING/PREPARING
  // transitions, not just READY.
  getIO().to(kds).emit("order:item_updated", { orderId: req.params.id, item, outletId });

  // POS specifically cares about the READY transition — this is what tells
  // Cashier/Waiter "go serve this now."
  if (item.status === "READY") {
    getIO()
      .to(pos)
      .emit("order:item_ready", { orderId: req.params.id, orderItemId: item.id, outletId });
  }

  return sendSuccess(res, item, "Item status updated");
});

export const payOrder = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  // FIX (2026-09-29): userId bhi jaata hai — discount ka APPLY_DISCOUNT audit log isi user ke naam likhta hai
  const order = await ordersService.payOrder(
    req.params.id as string,
    outletId,
    req.user!.userId,
    req.body
  );

  // Keeps the Cashier/Owner's order list (payment status badge) in sync
  // across devices the moment a payment is recorded.
  const { pos } = rooms(outletId);
  getIO().to(pos).emit("order:updated", { order, outletId });

  return sendSuccess(res, order, "Payment completed");
});

export const voidOrder = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const order = await ordersService.voidOrder(
    req.params.id as string,
    outletId,
    req.user!.userId,
    req.body
  );

  // Both sides need to know a void happened: KDS should stop preparing it,
  // POS should stop showing it as serveable/payable.
  // FIX (2026-10-06): KDS ko bina customer phone (customer-privacy.ts)
  const { kds, pos } = rooms(outletId);
  getIO().to(kds).except(pos).emit("order:updated", { order: withoutCustomerPhone(order), outletId });
  getIO().to(pos).emit("order:updated", { order, outletId });

  return sendSuccess(res, order, "Order voided");
});