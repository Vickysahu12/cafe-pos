// features/tables/tables.api.ts
// USE CASE: Typed API calls for Tables module.
// CONNECTED TO: apiClient. Used by Setup screen, Tables screen.
//
// UPDATED (2026-10-11) — TABLE EDIT: rename / seats (updateTable), delete = archive (deleteTable),
// aur list mein har table ke running orders (activeOrders) — table tap → orders / naya bill.

import { apiClient } from '../../lib/api-client';

export interface TableActiveOrder {
  id: string;
  orderNumber: number;
  netAmount: number;
  orderStatus: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';
  createdAt: string;
  customerName: string | null;
  isQr: boolean;
}

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  activeOrders?: TableActiveOrder[]; // ADDED (2026-10-11)
}

export const tablesApi = {
  async getTables(): Promise<Table[]> {
    const res = await apiClient.get('/tables');
    return res.data.data;
  },
  // NAYA — Tables screen ka "Add Table" use karega
  async createTable(payload: { tableNumber: string; capacity: number }): Promise<Table> {
    const res = await apiClient.post('/tables', payload);
    return res.data.data;
  },
  // ADDED (2026-10-11): TABLE EDIT
  async updateTable(id: string, payload: { tableNumber?: string; capacity?: number }): Promise<Table> {
    const res = await apiClient.patch(`/tables/${id}`, payload);
    return res.data.data;
  },
  async deleteTable(id: string): Promise<void> {
    await apiClient.delete(`/tables/${id}`);
  },
  async updateStatus(id: string, status: Table['status']): Promise<Table> {
    const res = await apiClient.patch(`/tables/${id}/status`, { status });
    return res.data.data;
  },
};

/** ADDED (2026-10-11): "5" → "T5" (card) / "Table 5" (title); "Window 1" → jaisa likha */
export function tableShort(n: string): string {
  return /^\d+$/.test(n.trim()) ? `T${n.trim()}` : n;
}
export function tableTitle(n: string): string {
  return /^\d+$/.test(n.trim()) ? `Table ${n.trim()}` : n;
}
