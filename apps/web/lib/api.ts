// lib/api.ts
// USE CASE: Typed fetch wrapper for the public-menu API — all endpoints here are
// public/no-auth, matching the backend's public-menu module (tested Day 4).
// CONNECTED TO: config.ts. Used by every page under app/order/[slug]/.
//
// UI/UX PASS (2026-09-30):
//  - getMenu(slug, tableId) — per-table QR; response mein `table` aata hai
//  - createOrder: DINE_IN + tableId jab table QR se aaye
//  - Status response mein prices/tax/table (status page pe sahi bill)
//  - Errors: server HTML/khaali response de (cold start, 502) to bhi saaf message,
//    "Unexpected token <" jaisa JSON crash nahi; network fail pe friendly text.

import { API_BASE_URL } from './config';

export interface ProductVariant { id: string; name: string; price: number; }
export interface ProductAddon { id: string; name: string; price: number; }

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isVeg: boolean;
  taxRate: number;
  variants: ProductVariant[];
  addons: ProductAddon[];
}

export interface Category {
  id: string;
  name: string;
  products: Product[];
}

export interface PublicMenu {
  outlet: { name: string; address: string };
  table: { id: string; tableNumber: string } | null;
  categories: Category[];
  /** ADDED (2026-10-02): cafe ke asli best sellers (last 30 din) — product ids, max 6 */
  popular?: string[];
}

export interface OrderItemPayload {
  productId: string;
  variantId?: string;
  addonIds?: string[];
  quantity: number;
  notes?: string;
}

export interface CreateOrderPayload {
  orderType: 'TAKEAWAY' | 'DINE_IN';
  tableId?: string;
  items: OrderItemPayload[];
}

export interface PublicOrderResponse {
  id: string;
  orderNumber: number;
  netAmount: number;
  orderStatus: string;
  paymentStatus: string;
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export interface PublicOrderStatus {
  id: string;
  orderNumber: number;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  orderStatus: OrderStatus;
  paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  createdAt: string;
  /** ADDED (2026-10-02): last change ka time ("Updated 3:12 PM") */
  updatedAt?: string;
  table: { tableNumber: string } | null;
  items: { id: string; quantity: number; status: string; totalPrice: number; product: { name: string; isVeg: boolean } }[];
}

/** ADDED (2026-10-05): digital bill (order.billraw.in/bill/<orderId>) — WhatsApp pe bheja jaata hai */
export interface PublicBill {
  orderNumber: number;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  orderStatus: OrderStatus;
  paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'REFUNDED';
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT' | null;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  createdAt: string;
  updatedAt: string;
  table: { tableNumber: string } | null;
  outlet: { name: string; address: string; phone: string; gstNumber: string | null; slug: string };
  items: { quantity: number; unitPrice: number; totalPrice: number; product: { name: string; isVeg: boolean } }[];
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError("Can't reach the café right now. Check your internet and try again.");
  }
  let json: { success?: boolean; message?: string; data?: T } | null = null;
  try {
    json = await res.json();
  } catch {
    // HTML / empty body (server waking up, proxy error)
  }
  if (!res.ok || !json?.success) {
    const fallback = res.status === 404 ? 'Not found.' : 'Something went wrong. Please try again in a moment.';
    throw new ApiError(json?.message || fallback, res.status);
  }
  return json.data as T;
}

const enc = encodeURIComponent;

export const publicMenuApi = {
  getMenu(slug: string, tableId?: string | null): Promise<PublicMenu> {
    const qs = tableId ? `?table=${enc(tableId)}` : '';
    return request(`${API_BASE_URL}/public/${enc(slug)}/menu${qs}`);
  },
  createOrder(slug: string, payload: CreateOrderPayload): Promise<PublicOrderResponse> {
    return request(`${API_BASE_URL}/public/${enc(slug)}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
  getOrderStatus(slug: string, orderId: string): Promise<PublicOrderStatus> {
    return request(`${API_BASE_URL}/public/${enc(slug)}/orders/${enc(orderId)}`);
  },
  // ADDED (2026-10-05): server component (bill page) se bhi chalta hai — fetch dono jagah hai
  getBill(orderId: string): Promise<PublicBill> {
    return request(`${API_BASE_URL}/public/bills/${enc(orderId)}`);
  },
};
