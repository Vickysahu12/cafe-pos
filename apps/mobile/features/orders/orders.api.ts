// features/orders/orders.api.ts
// USE CASE: Typed API calls for Orders module.
// CONNECTED TO: apiClient. Used by Billing, Checkout, Dashboard, Active Orders screen.

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
}

export interface CreateOrderPayload {
  tableId?: string;
  orderType: OrderType;
  items: OrderItemPayload[];
  notes?: string;
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
}

export interface OrderResponse {
  id: string;
  orderNumber: number;
  tableId: string | null;
  orderType: OrderType;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  orderStatus: OrderStatus;
  createdAt: string;
  items: OrderItemResponse[];
}

export interface OrderSummary {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  netAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  table: { tableNumber: string } | null;
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
  // NAYA — Active Orders screen ka "Mark as Served" use karega
  async updateOrderStatus(id: string, status: OrderStatus): Promise<OrderResponse> {
    const res = await apiClient.patch(`/orders/${id}/status`, { status });
    return res.data.data;
  },
};