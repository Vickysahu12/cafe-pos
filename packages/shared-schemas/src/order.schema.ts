import { z } from "zod";

// Single item inside a cart/order
export const OrderItemSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  variantId: z.string().uuid("Invalid variant ID").optional(),
  addonIds: z.array(z.string().uuid()).optional(),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  notes: z.string().max(200, "Note is too long").optional(), // e.g. "Less sugar"
});
export type OrderItemInput = z.infer<typeof OrderItemSchema>;

// Create a new order — used by both Cashier app AND customer QR web
export const CreateOrderSchema = z.object({
  outletId: z.string().uuid("Invalid outlet ID"),
  tableId: z.string().uuid("Invalid table ID").optional(), // nullable for Takeaway
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  items: z.array(OrderItemSchema).min(1, "Order must have at least 1 item"),
  notes: z.string().max(300).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// Update order/order-item status — used by Chef (KDS) and Cashier
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"]),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

// Complete payment for an order — Cashier only
export const PayOrderSchema = z.object({
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "CREDIT", "SPLIT"]),
  discountAmount: z.number().min(0).optional().default(0),
  amountReceived: z.number().positive().optional(), // for cash change calculation
});
export type PayOrderInput = z.infer<typeof PayOrderSchema>;

// Void/cancel an order — requires Owner/Manager role (checked in middleware, not here)
export const VoidOrderSchema = z.object({
  reason: z.string().min(5, "Please provide a reason (min 5 characters)"),
});
export type VoidOrderInput = z.infer<typeof VoidOrderSchema>;


// Kyun aisa design kiya, samjho:

// CreateOrderSchema dono Cashier app aur customer QR web dono use karenge — same shape hai, bas backend mein hum check karenge ki request kahan se aayi (authenticated Cashier vs public customer) taaki cashierId ya customer info alag se handle ho sake. Isse duplicate schema nahi likhna padega.
// VoidOrderSchema mein reason mandatory rakha hai — tumhare PRD mein "Zero-Theft Audit Logs" feature hai, toh void karte waqt reason capture karna zaroori hai audit trail ke liye. Role check (Owner/Manager) schema mein nahi, authorize middleware mein hoga — schema sirf data-shape validate karta hai, permission nahi.
// PayOrderSchema mein amountReceived optional rakha hai — sirf Cash payment ke time cashier "Received ₹500, return ₹120" wala calculator use karega jo tumhare PRD mein tha; UPI/Card mein zaroorat nahi.