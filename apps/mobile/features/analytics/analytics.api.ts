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

// ADDED (2026-09-30): Sales Report screen (Owner) — 7/30 din ka daily graph
export interface SalesReport {
  days: number;
  from: string;
  to: string;
  series: { date: string; revenue: number; orders: number }[];
  totals: { revenue: number; orders: number; avgOrderValue: number };
  previous: { revenue: number; orders: number };
  paymentSplit: { cash: number; upi: number; card: number; other: number };
  topItems: { name: string; quantity: number; revenue: number }[];
}

export interface HourlyPoint {
  hour: number;
  orderCount: number;
  revenue: number;
}

export const analyticsApi = {
  async getDailySummary(): Promise<DailySummary> {
    const res = await apiClient.get('/analytics/daily-summary');
    return res.data.data;
  },
  async getSalesReport(days: 7 | 30): Promise<SalesReport> {
    const res = await apiClient.get('/analytics/sales-report', { params: { days } });
    return res.data.data;
  },
  async getHourlySales(): Promise<HourlyPoint[]> {
    const res = await apiClient.get('/analytics/hourly-sales');
    return res.data.data;
  },
};