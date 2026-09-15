// features/analytics/analytics.api.ts
// USE CASE: Typed API calls for Analytics module — Dashboard's core data source.
// CONNECTED TO: apiClient. Used by (admin)/dashboard.tsx.

import { apiClient } from '../../lib/api-client';

export interface DailySummary {
  date: string;
  totalSales: number;
  totalOrders: number;
  paidOrders: number;
  cashVsUpi: { cash: number; upi: number };
  topSellingItems: { name: string; quantity: number }[];
}

export const analyticsApi = {
  async getDailySummary(): Promise<DailySummary> {
    const res = await apiClient.get('/analytics/daily-summary');
    return res.data.data;
  },
};