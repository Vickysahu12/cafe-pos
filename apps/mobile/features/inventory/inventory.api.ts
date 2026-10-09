// features/inventory/inventory.api.ts
// USE CASE: Typed API calls for Inventory module.
// CONNECTED TO: apiClient. Used by inventory/index.tsx, inventory/create.tsx, Dashboard's low-stock alert.
//
// UPDATED (2026-10-09) — STOCK SOP: item detail + history, purchase, wastage, stock count
// (variance), archive, recipes (menu item → ingredients), billing availability.
// Backend: modules/inventory (stock.service.ts = ledger). Units: lib/units.ts

import { apiClient } from '../../lib/api-client';
import type { StockUnit } from '../../lib/units';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lowStockAlertAt: number;
  isLowStock?: boolean;
  // ADDED (2026-10-09)
  costPerUnit?: number;
  isOut?: boolean;
  stockValue?: number;
  recipeCount?: number;
  lastCountedAt?: string | null;
}

export interface CreateInventoryItemPayload {
  name: string;
  quantity: number;
  unit: StockUnit | string;
  lowStockAlertAt?: number;
  costPerUnit?: number; // ADDED (2026-10-09)
}

export type MovementType = 'OPENING' | 'PURCHASE' | 'SALE' | 'SALE_REVERSAL' | 'WASTAGE' | 'COUNT' | 'ADJUSTMENT';

export interface StockMovement {
  id: string;
  type: MovementType;
  quantity: number; // signed, item unit
  balanceAfter: number;
  unitCost: number;
  orderNumber: number | null;
  note: string | null;
  createdAt: string;
  by: string | null;
}

export interface InventoryItemDetail {
  item: InventoryItem;
  movements: StockMovement[];
  nextBefore: string | null;
  usedIn: { productId: string; productName: string; variantName: string | null; quantity: number; unit: string }[];
}

export interface CountLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  expected: number;
  actual: number;
  variance: number;
  varianceValue: number;
}

export interface StockCountResult {
  countId: string;
  at?: string;
  by?: string | null;
  note?: string | null;
  itemsCounted: number;
  itemsWithVariance: number;
  missingValue: number; // ≤ 0
  extraValue: number; // ≥ 0
  lines: CountLine[];
}

export interface StockCountSummary {
  countId: string;
  at: string;
  itemsCounted: number;
  itemsWithVariance: number;
  missingValue: number;
  extraValue: number;
  by: string | null;
}

export interface RecipeLine {
  variantName: string | null;
  inventoryItemId: string;
  itemName: string;
  itemUnit: string;
  itemQuantity: number;
  quantity: number;
  unit: string;
  cost: number;
}

export interface RecipeSize {
  variantName: string | null;
  price: number;
  cost: number;
  margin: number;
  foodCostPct: number;
  usesOwnRecipe: boolean;
  hasRecipe: boolean;
}

export interface Recipe {
  product: { id: string; name: string; price: number; variants: { name: string; price: number }[] };
  lines: RecipeLine[];
  sizes: RecipeSize[];
}

export type RecipeSummary = Record<string, { lineCount: number; cost: number; price: number; margin: number; foodCostPct: number }>;

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

  // ── ADDED (2026-10-09) ──
  async getItem(itemId: string, before?: string): Promise<InventoryItemDetail> {
    const res = await apiClient.get(`/inventory/${itemId}`, { params: before ? { before } : undefined });
    return res.data.data;
  },
  async updateItem(itemId: string, payload: { name?: string; lowStockAlertAt?: number; costPerUnit?: number }): Promise<InventoryItem> {
    const res = await apiClient.patch(`/inventory/${itemId}`, payload);
    return res.data.data;
  },
  async archiveItem(itemId: string): Promise<void> {
    await apiClient.delete(`/inventory/${itemId}`);
  },
  async purchase(itemId: string, payload: { quantity: number; unitCost?: number; note?: string }): Promise<InventoryItem> {
    const res = await apiClient.post(`/inventory/${itemId}/purchase`, payload);
    return res.data.data;
  },
  async wastage(itemId: string, payload: { quantity: number; note: string }): Promise<InventoryItem> {
    const res = await apiClient.post(`/inventory/${itemId}/wastage`, payload);
    return res.data.data;
  },
  async createCount(payload: { items: { inventoryItemId: string; actualQuantity: number }[]; note?: string }): Promise<StockCountResult> {
    const res = await apiClient.post('/inventory/counts', payload);
    return res.data.data;
  },
  async getCounts(): Promise<StockCountSummary[]> {
    const res = await apiClient.get('/inventory/counts');
    return res.data.data;
  },
  async getCount(countId: string): Promise<StockCountResult> {
    const res = await apiClient.get(`/inventory/counts/${countId}`);
    return res.data.data;
  },
  async getAvailability(): Promise<{ out: string[]; low: string[] }> {
    const res = await apiClient.get('/inventory/availability');
    return res.data.data;
  },
  async getRecipeSummary(): Promise<RecipeSummary> {
    const res = await apiClient.get('/inventory/recipes');
    return res.data.data;
  },
  async getRecipe(productId: string): Promise<Recipe> {
    const res = await apiClient.get(`/inventory/recipes/${productId}`);
    return res.data.data;
  },
  async saveRecipe(
    productId: string,
    lines: { variantName: string | null; inventoryItemId: string; quantity: number; unit: string }[]
  ): Promise<Recipe> {
    const res = await apiClient.put(`/inventory/recipes/${productId}`, { lines });
    return res.data.data;
  },
};
