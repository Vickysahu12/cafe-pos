// features/menu/menu.api.ts
// USE CASE: Typed API calls for Menu module — categories aur products fetch karna.
// CONNECTED TO: apiClient. Used by Setup screen, Cashier Billing screen (aage banega).

import { apiClient } from '../../lib/api-client';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isAvailable: boolean;
  _count: { products: number };
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isVeg: boolean;
  taxRate: number;
  variants: ProductVariant[];
  addons: ProductAddon[];
}

export const menuApi = {
  async getCategories(): Promise<Category[]> {
    const res = await apiClient.get('/menu/categories');
    return res.data.data;
  },
  async getProducts(params?: { categoryId?: string }): Promise<Product[]> {
    const res = await apiClient.get('/menu/products', { params });
    return res.data.data;
  },
};