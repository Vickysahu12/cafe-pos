export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type OrderStatus = "PENDING" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID" | "PARTIAL" | "REFUNDED";
export type PaymentMethod = "CASH" | "UPI" | "CARD" | "CREDIT" | "SPLIT";
export type OrderItemStatus = "PENDING" | "PREPARING" | "READY";

// Shape sent to the frontend/mobile when fetching a full order with items
export interface OrderWithItems {
  id: string;
  orderNumber: number;
  outletId: string;
  tableId: string | null;
  orderType: OrderType;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  orderStatus: OrderStatus;
  cashierId: string | null;
  notes: string | null;
  createdAt: string;
  items: OrderItemDetail[];
}

export interface OrderItemDetail {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
  status: OrderItemStatus;
}

// Socket.io event payloads — kept here so both backend (emitter)
// and mobile (listener) agree on the exact shape
export interface OrderCreatedEvent {
  order: OrderWithItems;
  outletId: string;
}

export interface OrderItemReadyEvent {
  orderId: string;
  orderItemId: string;
  outletId: string;
}