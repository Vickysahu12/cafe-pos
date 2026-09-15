// features/orders/orders.api.ts
// USE CASE: Typed API calls for Orders module — used by Dashboard's "Recent Orders"
//           and (later) the full Cashier Active Orders / Order Detail screens.
// CONNECTED TO: apiClient.

import { apiClient } from '../../lib/api-client';

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';

export interface OrderSummary {
  id: string;
  orderNumber: number;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  netAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  table: { tableNumber: string } | null;
}

export const ordersApi = {
  async getOrders(): Promise<OrderSummary[]> {
    const res = await apiClient.get('/orders');
    return res.data.data;
  },
};