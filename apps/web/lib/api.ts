// lib/api.ts
// USE CASE: Typed fetch wrapper for the public-menu API — all endpoints here are
// public/no-auth, matching the backend's public-menu module (tested Day 4).
// CONNECTED TO: config.ts. Used by every page under app/order/[slug]/.

import { API_BASE_URL } from './config';

export interface ProductVariant { id: string; name: string; price: number; }
export interface ProductAddon { id: string; name: string; price: number; }

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  isVeg: boolean;
  taxRate: number;
  variants: ProductVariant[];
  addons: ProductAddon[];
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isAvailable: boolean;
  products: Product[];
}

export interface PublicMenu {
  outlet: { name: string; address: string };
  categories: Category[];
}

export interface OrderItemPayload {
  productId: string;
  variantId?: string;
  addonIds?: string[];
  quantity: number;
  notes?: string;
}

export interface PublicOrderResponse {
  id: string;
  orderNumber: number;
  netAmount: number;
  orderStatus: string;
  paymentStatus: string;
}

export interface PublicOrderStatus {
  id: string;
  orderNumber: number;
  orderStatus: string;
  paymentStatus: string;
  netAmount: number;
  items: { id: string; quantity: number; status: string; product: { name: string } }[];
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Something went wrong');
  return json.data;
}

export const publicMenuApi = {
  async getMenu(slug: string): Promise<PublicMenu> {
    const res = await fetch(`${API_BASE_URL}/public/${slug}/menu`, { cache: 'no-store' });
    return handleResponse(res);
  },
  async createOrder(slug: string, payload: { orderType: 'TAKEAWAY'; items: OrderItemPayload[] }): Promise<PublicOrderResponse> {
    const res = await fetch(`${API_BASE_URL}/public/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },
  async getOrderStatus(slug: string, orderId: string): Promise<PublicOrderStatus> {
    const res = await fetch(`${API_BASE_URL}/public/${slug}/orders/${orderId}`, { cache: 'no-store' });
    return handleResponse(res);
  },
};