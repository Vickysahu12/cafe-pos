// features/inventory/inventory.api.ts
// USE CASE: Typed API calls for Inventory module.
// CONNECTED TO: apiClient. Used by inventory/index.tsx, inventory/create.tsx, Dashboard's low-stock alert.

import { apiClient } from '../../lib/api-client';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lowStockAlertAt: number;
  isLowStock?: boolean;
}

export interface CreateInventoryItemPayload {
  name: string;
  quantity: number;
  unit: string;
  lowStockAlertAt?: number;
}

export const inventoryApi = {
  async getItems(): Promise<InventoryItem[]> {
    const res = await apiClient.get('/inventory');
    return res.data.data;
  },
  async getLowStockItems(): Promise<InventoryItem[]> {
    const res = await apiClient.get('/inventory/low-stock');
    return res.data.data;
  },
  async createItem(payload: CreateInventoryItemPayload): Promise<InventoryItem> {
    const res = await apiClient.post('/inventory', payload);
    return res.data.data;
  },
  async updateQuantity(itemId: string, payload: { mode: 'SET' | 'ADD'; quantity: number }): Promise<InventoryItem> {
    const res = await apiClient.patch(`/inventory/${itemId}/quantity`, payload);
    return res.data.data;
  },
};