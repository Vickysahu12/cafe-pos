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
  // ADDED (2026-10-11): COMPLIMENTARY — sirf Owner/Manager (server role check; QR order pe hamesha mana)
  complimentary: z.boolean().optional(),
});
export type OrderItemInput = z.infer<typeof OrderItemSchema>;

// ADDED (2026-10-06): customer ka Indian mobile — "+91 98765-43210", "098765 43210",
// "9876543210" sab chalte hain → hamesha 10 digits ("9876543210") store hote hain.
// 6/7/8/9 se shuru (Indian mobile). Galat number pe saaf message.
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const CustomerPhoneSchema = z
  .string()
  .trim()
  .max(20, "Enter a valid 10-digit mobile number")
  .transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid 10-digit mobile number" });
      return z.NEVER;
    }
    return n;
  });

export const CustomerNameSchema = z
  .string()
  .trim()
  .min(1, "Please enter your name")
  .max(40, "Name is too long (max 40 characters)")
  // sirf naam jaise characters — KDS/receipt pe ajeeb symbols/links na aayein
  .regex(/^[\p{L}\p{M} .'-]+$/u, "Please use letters only in the name");

// Create a new order — used by both Cashier app AND customer QR web
export const CreateOrderSchema = z.object({
  outletId: z.string().uuid("Invalid outlet ID"),
  tableId: z.string().uuid("Invalid table ID").optional(), // nullable for Takeaway
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  // FIX (2026-09-29): max 50 line items per order (spam/DoS guard, dekho upar)
  items: z.array(OrderItemSchema).min(1, "Order must have at least 1 item").max(50, "Too many items in one order"),
  notes: z.string().max(300).optional(),
  // ADDED (2026-10-06): customer contact (QR orders pe; cashier app mein optional).
  // Kab REQUIRED hai woh public-menu.service decide karta hai (takeaway pe phone zaroori).
  customerName: CustomerNameSchema.optional(),
  customerPhone: CustomerPhoneSchema.optional(),
  // ADDED (2026-10-11): COMPLIMENTARY — koi item free ho to reason zaroori (server check karta hai)
  complimentaryReason: z.string().trim().min(2, "Please add a reason").max(120, "Reason is too long").optional(),
  // ADDED (2026-10-11): DELIVERY — website se delivery order pe zaroori (public-menu.service check
  // karta hai). Charge kabhi client se nahi aata — server outlet ki setting se lagata hai.
  deliveryAddress: z
    .string()
    .trim()
    .min(10, "Please enter your full address (house, street, area)")
    .max(300, "Address is too long")
    .optional(),
  // FIX (2026-10-12): IDEMPOTENCY — website har cart ke liye ek UUID banati hai. Order server tak pahunch
  // gaya par response kho gaya (4G blip / Render cold start) → customer dobara tap kare to DOOSRA order
  // nahi banta, wahi purana lauta dete hain. (outletId + clientRequestId) DB mein unique hai.
  clientRequestId: z.string().uuid().optional(),
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
  // ADDED (2026-10-09): Stock SOP — khana ban chuka tha? true = ingredients WASTAGE mein jaate hain
  // (stock wapas nahi aata); false/na bheja = stock wapas (purana app bhi yahi behaviour paata hai)
  foodMade: z.boolean().optional(),
});
export type VoidOrderInput = z.infer<typeof VoidOrderSchema>;


// Kyun aisa design kiya, samjho:

// CreateOrderSchema dono Cashier app aur customer QR web dono use karenge — same shape hai, bas backend mein hum check karenge ki request kahan se aayi (authenticated Cashier vs public customer) taaki cashierId ya customer info alag se handle ho sake. Isse duplicate schema nahi likhna padega.
// VoidOrderSchema mein reason mandatory rakha hai — tumhare PRD mein "Zero-Theft Audit Logs" feature hai, toh void karte waqt reason capture karna zaroori hai audit trail ke liye. Role check (Owner/Manager) schema mein nahi, authorize middleware mein hoga — schema sirf data-shape validate karta hai, permission nahi.
// PayOrderSchema mein amountReceived optional rakha hai — sirf Cash payment ke time cashier "Received ₹500, return ₹120" wala calculator use karega jo tumhare PRD mein tha; UPI/Card mein zaroorat nahi.

// ADDED (2026-10-11): COMPLIMENTARY on an existing (unpaid) order — Owner/Manager.
// itemIds = jo items free karne hain; "all" = poora bill.
export const ComplimentaryOrderSchema = z.object({
  itemIds: z.union([z.literal("all"), z.array(z.string().uuid()).min(1, "Pick at least one item").max(50)]),
  reason: z.string().trim().min(2, "Please add a reason").max(120, "Reason is too long"),
});
export type ComplimentaryOrderInput = z.infer<typeof ComplimentaryOrderSchema>;


// ADDED (2026-10-11): DELIVERY — staff order pe charge badle / status aage badhaye.
// Charge: Owner/Manager, sirf unpaid order. Status: Owner/Manager/Cashier.
export const UpdateDeliverySchema = z
  .object({
    deliveryCharge: z.number().finite().min(0, "Charge cannot be negative").max(2000, "That charge is too high").optional(),
    deliveryStatus: z.enum(["PLACED", "OUT_FOR_DELIVERY", "DELIVERED"]).optional(),
  })
  .strict()
  .refine((v) => v.deliveryCharge !== undefined || v.deliveryStatus !== undefined, "Nothing to update");
export type UpdateDeliveryInput = z.infer<typeof UpdateDeliverySchema>;
