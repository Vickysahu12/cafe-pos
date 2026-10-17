// features/orders/orders.api.ts
// USE CASE: Typed API calls for Orders module.
// CONNECTED TO: apiClient. Used by Billing, Checkout, Dashboard, Active Orders, KDS.

import { apiClient } from '../../lib/api-client';

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';

export interface OrderItemPayload {
  productId: string;
  variantId?: string;
  addonIds?: string[];
  quantity: number;
  notes?: string;
  complimentary?: boolean; // ADDED (2026-10-11): Owner/Manager only (server checks)
}

export interface CreateOrderPayload {
  tableId?: string;
  orderType: OrderType;
  items: OrderItemPayload[];
  notes?: string;
  complimentaryReason?: string; // ADDED (2026-10-11): free items ho to zaroori
}

export interface OrderItemResponse {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
  status: 'PENDING' | 'PREPARING' | 'READY';
  product: { name: string };
  // ADDED (2026-10-09): kaunsa size bika ("Large") — KDS / order detail pe dikhta hai
  variantName?: string | null;
  // FIX (2026-10-12): add-ons ke naam ("Extra Cheese, Oat milk") — pehle save hi nahi hote the
  addonNames?: string | null;
  // ADDED (2026-10-11): COMPLIMENTARY — free item (totalPrice 0, compValue = jo price tha)
  isComplimentary?: boolean;
  compValue?: number;
  compReason?: string | null;
}

export interface OrderResponse {
  id: string;
  orderNumber: number;
  tableId: string | null;
  orderType: OrderType;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  complimentaryValue?: number; // ADDED (2026-10-11): is bill mein free diye items ki value
  // ADDED (2026-10-11): DELIVERY (website se) — address sirf Owner/Manager/Cashier ko (kitchen ko nahi)
  deliveryAddress?: string | null;
  // ADDED (2026-10-17): customer ka GPS pin (website pe "Use my current location") — Maps exact jagah
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryCharge?: number;
  deliveryStatus?: DeliveryStatus | null;
  // ADDED (2026-10-18): WHATSAPP DELIVERY LINK — kaun le gaya, kab bheja, delivery boy ne kya kiya
  deliveryPersonId?: string | null; // null + naam = "I'll deliver myself"
  deliveryPersonName?: string | null;
  deliverySentAt?: string | null;
  deliveredAt?: string | null;
  deliveryIssue?: 'CUSTOMER_UNAVAILABLE' | 'SHORT_PAYMENT' | null;
  deliveryIssueAt?: string | null;
  deliveryCollected?: number | null;
  deliveryCollectedMethod?: PaymentMethod | null;
  netAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  orderStatus: OrderStatus;
  cashierId: string | null; // FIX (2026-09-29): backend bhejta tha, type mein missing tha (orders/[id].tsx ka QR badge)
  createdAt: string;
  items: OrderItemResponse[];
  // ADDED (2026-10-06): QR order ka customer. Phone sirf Owner/Manager/Cashier ko aata hai
  // (backend Chef ke liye null bhejta hai). 30 din baad server phone hata deta hai.
  customerName?: string | null;
  customerPhone?: string | null;
}

// ADDED (2026-10-11): DELIVERY
export type DeliveryStatus = 'PLACED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

export interface OrderSummary {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  netAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  cashierId: string | null; // ← naya — null matlab customer ne QR se order kiya
  createdAt: string;
  customerName?: string | null; // ADDED (2026-10-06): list/KDS pe "#23 · Rahul"
  table: { tableNumber: string } | null;
  deliveryStatus?: DeliveryStatus | null; // ADDED (2026-10-11)
}

export interface KdsOrder extends OrderSummary {
  items: OrderItemResponse[];
}

export const ordersApi = {
  async createOrder(payload: CreateOrderPayload): Promise<OrderResponse> {
    const res = await apiClient.post('/orders', payload);
    return res.data.data;
  },
  async getOrders(): Promise<OrderSummary[]> {
    const res = await apiClient.get('/orders');
    return res.data.data;
  },
  async getOrderById(id: string): Promise<OrderResponse> {
    const res = await apiClient.get(`/orders/${id}`);
    return res.data.data;
  },
  async payOrder(id: string, payload: { paymentMethod: PaymentMethod; discountAmount?: number }): Promise<OrderResponse> {
    const res = await apiClient.post(`/orders/${id}/pay`, payload);
    return res.data.data;
  },
  // Active Orders screen ka "Mark as Served" + KDS ka "Mark Order Ready" dono isko use karte hain
  async updateOrderStatus(id: string, status: OrderStatus): Promise<OrderResponse> {
    const res = await apiClient.patch(`/orders/${id}/status`, { status });
    return res.data.data;
  },
  // FIX (2026-09-30): Owner/Manager order cancel (void) — backend pehle se tha, app mein button nahi tha.
  // Reason zaroori (min 5 chars) — Owner ke Audit Logs mein dikhta hai.
  // UPDATED (2026-10-09): foodMade — khana ban chuka tha to ingredients WASTAGE mein (stock wapas nahi)
  // ADDED (2026-10-11): DELIVERY — charge (Owner/Manager, unpaid) / status (staff)
  async updateDelivery(id: string, payload: { deliveryCharge?: number; deliveryStatus?: DeliveryStatus }): Promise<OrderResponse> {
    const res = await apiClient.patch(`/orders/${id}/delivery`, payload);
    return res.data.data;
  },
  // ADDED (2026-10-11): COMPLIMENTARY on an unpaid order (Owner/Manager)
  async makeComplimentary(id: string, itemIds: string[] | 'all', reason: string): Promise<OrderResponse> {
    const res = await apiClient.post(`/orders/${id}/complimentary`, { itemIds, reason });
    return res.data.data;
  },
  async voidOrder(id: string, reason: string, foodMade?: boolean): Promise<OrderResponse> {
    const res = await apiClient.post(`/orders/${id}/void`, foodMade === undefined ? { reason } : { reason, foodMade });
    return res.data.data;
  },
  // Chef KDS board ka per-item status update
  async updateOrderItemStatus(
    orderId: string,
    itemId: string,
    status: 'PENDING' | 'PREPARING' | 'READY'
  ): Promise<OrderItemResponse> {
    const res = await apiClient.patch(`/orders/${orderId}/items/${itemId}/status`, { status });
    return res.data.data;
  },
};