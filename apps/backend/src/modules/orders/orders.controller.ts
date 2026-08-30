/**
 * ORDERS CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer + Socket.io emit karne ki jagah. Order
 * create/update hone ke baad, yahi se KDS/POS rooms ko real-time
 * event bhejte hain — service layer khud sockets nahi jaanta
 * (separation of concerns), controller hi orchestration karta hai.
 *
 * CONNECTED TO:
 * - orders.service.ts  → business logic
 * - sockets/index.ts    → getIO() se events emit
 * - orders.routes.ts     → yeh handlers routes se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as ordersService from "./orders.service";
import { getIO } from "../../sockets";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const cashierId = req.user!.role === "CASHIER" ? req.user!.userId : null;

  const order = await ordersService.createOrder(req.body, outletId, cashierId);

  // Real-time: KDS room ko turant naya order dikhao
  getIO().to(`outlet_${outletId}_kds`).emit("order:created", { order, outletId });

  return sendSuccess(res, order, "Order created", 201);
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const { orderStatus, tableId, paymentStatus, dateFrom, dateTo } = req.query;
  const orders = await ordersService.getOrders(req.user!.outletId, {
    orderStatus: orderStatus as string | undefined,
    tableId: tableId as string | undefined,
    paymentStatus: paymentStatus as string | undefined,
    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
    dateTo: dateTo ? new Date(dateTo as string) : undefined,
  });
  return sendSuccess(res, orders);
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const order = await ordersService.getOrderById(req.params.id as string, req.user!.outletId);
  return sendSuccess(res, order);
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const order = await ordersService.updateOrderStatus(req.params.id as string, outletId, req.body);

  // Waiter/Cashier ko turant pata chale agar Chef ne SERVED-eligible status diya
  getIO().to(`outlet_${outletId}_pos`).emit("order:updated", { order, outletId });

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

  // Item READY hote hi POS/Waiter room ko turant batao — yehi tumhara
  // "Chef mark ready → Cashier/Waiter ko pata chale" wala flow hai
  if (item.status === "READY") {
    getIO()
      .to(`outlet_${outletId}_pos`)
      .emit("order:item_ready", { orderId: req.params.id, orderItemId: item.id, outletId });
  }

  return sendSuccess(res, item, "Item status updated");
});

export const payOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await ordersService.payOrder(req.params.id as string, req.user!.outletId, req.body);
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

  getIO().to(`outlet_${outletId}_kds`).emit("order:updated", { order, outletId });

  return sendSuccess(res, order, "Order voided");
});