// features/menu/menu.api.ts
// USE CASE: Typed API calls for Menu module.
// CONNECTED TO: apiClient. Used by Categories, Products list, Create Product screens.

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
  description: string | null;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isVeg: boolean;
  taxRate: number;
  variants: ProductVariant[];
  addons: ProductAddon[];
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  isVeg: boolean;
  taxRate?: number;
  variants?: { name: string; price: number }[];
  addons?: { name: string; price: number }[];
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
  async createCategory(payload: { name: string }): Promise<Category> {
    const res = await apiClient.post('/menu/categories', payload);
    return res.data.data;
  },
  // NAYA — Create Product screen use karega
  async createProduct(payload: CreateProductPayload): Promise<Product> {
    const res = await apiClient.post('/menu/products', payload);
    return res.data.data;
  },

  // ── FIX (2026-09-29): edit/delete — pehle Owner price tak nahi badal sakta tha ──

  /** Product edit — variants/addons diye to purane replace ho jaate hain */
  async updateProduct(productId: string, payload: Partial<Omit<CreateProductPayload, 'description'>> & { isAvailable?: boolean }): Promise<Product> {
    const res = await apiClient.patch(`/menu/products/${productId}`, payload);
    return res.data.data;
  },
  /** Product delete — jiske purane orders hain woh archive hota hai (bills safe), baaki delete */
  async deleteProduct(productId: string): Promise<void> {
    await apiClient.delete(`/menu/products/${productId}`);
  },
  /** Category delete — sirf khaali category (backend 409 deta hai agar items bache hain) */
  async deleteCategory(categoryId: string): Promise<void> {
    await apiClient.delete(`/menu/categories/${categoryId}`);
  },
};