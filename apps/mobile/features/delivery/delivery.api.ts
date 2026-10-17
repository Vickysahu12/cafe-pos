// features/delivery/delivery.api.ts
// ADDED (2026-10-18): WHATSAPP DELIVERY LINK
// USE CASE: Cafe ke delivery log (naam + WhatsApp number), order "Send to delivery person"
// (link token wapas aata hai — sirf isi response mein), aur delivery boy ke paas cash (Owner/Manager).
// CONNECTED TO: backend /api/v1/delivery, components/delivery/SendToDeliverySheet.tsx,
//               components/delivery/DeliveryCashCard.tsx, app/(cashier)/orders/[id].tsx

import { apiClient } from '../../lib/api-client';
import type { OrderResponse } from '../orders/orders.api';

export interface DeliveryPerson {
  id: string;
  name: string;
  phone: string; // 10 digit
}

export interface DispatchResult {
  order: OrderResponse;
  /** null = "I'll deliver myself" (koi link nahi) */
  token: string | null;
  personPhone: string | null;
}

export interface DeliveryCashGroup {
  deliveryPersonId: string;
  name: string;
  cash: number;
  count: number;
  orderIds: string[];
}

export const deliveryApi = {
  async listPeople(): Promise<DeliveryPerson[]> {
    const res = await apiClient.get('/delivery/people');
    return res.data.data;
  },
  async addPerson(name: string, phone: string): Promise<DeliveryPerson> {
    const res = await apiClient.post('/delivery/people', { name, phone });
    return res.data.data;
  },
  async removePerson(id: string): Promise<void> {
    await apiClient.delete(`/delivery/people/${id}`);
  },
  async dispatch(orderId: string, to: { deliveryPersonId: string } | { self: true }): Promise<DispatchResult> {
    const res = await apiClient.post(`/delivery/orders/${orderId}/dispatch`, to);
    return res.data.data;
  },
  async getCash(): Promise<DeliveryCashGroup[]> {
    const res = await apiClient.get('/delivery/cash');
    return res.data.data;
  },
  async settleCash(deliveryPersonId: string, orderIds: string[]): Promise<{ amount: number; orders: number }> {
    const res = await apiClient.post('/delivery/cash/settle', { deliveryPersonId, orderIds });
    return res.data.data;
  },
};
