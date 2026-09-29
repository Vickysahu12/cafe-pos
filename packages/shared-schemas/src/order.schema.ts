import { z } from "zod";

// Single item inside a cart/order
export const OrderItemSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  variantId: z.string().uuid("Invalid variant ID").optional(),
  // FIX (2026-09-29): upper limits add kiye. Pehle quantity/addons unlimited the —
  // public QR route pe koi bhi `quantity: 999999` ya 10,000 addons bhej ke
  // absurd order / heavy DB query bana sakta tha. Real cafe order mein ek item
  // ki 100 se zyada quantity practically nahi hoti.
  addonIds: z.array(z.string().uuid()).max(20, "Too many addons").optional(),
  quantity: z.number().int().positive("Quantity must be at least 1").max(100, "Quantity cannot exceed 100"),
  notes: z.string().max(200, "Note is too long").optional(), // e.g. "Less sugar"
});
export type OrderItemInput = z.infer<typeof OrderItemSchema>;

// Create a new order — used by both Cashier app AND customer QR web
export const CreateOrderSchema = z.object({
  outletId: z.string().uuid("Invalid outlet ID"),
  tableId: z.string().uuid("Invalid table ID").optional(), // nullable for Takeaway
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  // FIX (2026-09-29): max 50 line items per order (spam/DoS guard, dekho upar)
  items: z.array(OrderItemSchema).min(1, "Order must have at least 1 item").max(50, "Too many items in one order"),
  notes: z.string().max(300).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// Update order status — used by Chef (KDS) and Cashier
// FIX (2026-09-29): "CANCELLED" yahan se HATAYA. Pehle Cashier/Chef is route se
// order CANCELLED kar sakte the — jo Owner/Manager-only `/void` route aur uske
// audit log dono ko bypass karta tha (zero-theft feature ka poora hole).
// Cancel ab SIRF `POST /orders/:id/void` se hota hai.
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY", "SERVED"]),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

// FIX (2026-09-29): naya schema — KDS item-status route pe pehle koi validation
// hi nahi thi (galat value → Prisma crash → 500 with internal message).
export const UpdateOrderItemStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY"]),
});
export type UpdateOrderItemStatusInput = z.infer<typeof UpdateOrderItemStatusSchema>;

// Complete payment for an order — Cashier only
export const PayOrderSchema = z.object({
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "CREDIT", "SPLIT"]),
  discountAmount: z.number().min(0).optional().default(0),
  amountReceived: z.number().positive().optional(), // for cash change calculation
});
export type PayOrderInput = z.infer<typeof PayOrderSchema>;

// Void/cancel an order — requires Owner/Manager role (checked in middleware, not here)
export const VoidOrderSchema = z.object({
  reason: z.string().trim().min(5, "Please provide a reason (min 5 characters)").max(300, "Reason is too long"),
});
export type VoidOrderInput = z.infer<typeof VoidOrderSchema>;


// Kyun aisa design kiya, samjho:

// CreateOrderSchema dono Cashier app aur customer QR web dono use karenge — same shape hai, bas backend mein hum check karenge ki request kahan se aayi (authenticated Cashier vs public customer) taaki cashierId ya customer info alag se handle ho sake. Isse duplicate schema nahi likhna padega.
// VoidOrderSchema mein reason mandatory rakha hai — tumhare PRD mein "Zero-Theft Audit Logs" feature hai, toh void karte waqt reason capture karna zaroori hai audit trail ke liye. Role check (Owner/Manager) schema mein nahi, authorize middleware mein hoga — schema sirf data-shape validate karta hai, permission nahi.
// PayOrderSchema mein amountReceived optional rakha hai — sirf Cash payment ke time cashier "Received ₹500, return ₹120" wala calculator use karega jo tumhare PRD mein tha; UPI/Card mein zaroorat nahi.