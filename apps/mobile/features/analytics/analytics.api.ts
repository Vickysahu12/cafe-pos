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


// ─────────────────────────────────────────────────────────
// ADDED (2026-10-09): Reports batch 1 — backend insights.service.ts ka shape.
// Ek call mein poora Reports tab: KPIs + comparison, heatmap, items, staff, money leaks, closing.
// ─────────────────────────────────────────────────────────
export type InsightPeriod = 'today' | 'yesterday' | '7d' | '30d';

export interface PeriodTotals {
  revenue: number;
  orders: number;
  avgBill: number;
}

export interface ItemStat {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  share?: number; // % of item sales (sirf top list mein)
}

export interface StaffStat {
  userId: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'CHEF';
  isActive: boolean;
  orders: number;
  revenue: number;
  avgBill: number;
  billsVoided: number;
  billsVoidedAmount: number;
  discountsGiven: number;
  discountAmount: number;
  cancelsDone: number;
  cancelsAmount: number;
}

export interface Insights {
  period: InsightPeriod;
  from: string;
  to: string;
  isLive: boolean;
  asOf: string; // "HH:mm" IST
  kpis: PeriodTotals & { paidOrders: number; itemsSold: number; itemsPerOrder: number };
  /** Pichla barabar period, utne hi time tak (aaj 2 baje → kal 2 baje tak) */
  previous: PeriodTotals;
  /** Sirf Today/Yesterday: pichle hafte ka wahi din */
  lastWeek: PeriodTotals | null;
  series: { date: string; revenue: number; orders: number }[];
  hourly: { hour: number; orders: number; revenue: number }[];
  heatmap: {
    days: number; // 0 = abhi data nahi
    from: string;
    to: string;
    /** [Mon..Sun][0..23] — us slot mein average orders per din */
    avgOrders: number[][];
    peak: { day: number; hour: number; avgOrders: number } | null;
  };
  items: { top: ItemStat[]; slow: ItemStat[]; categories: { name: string; quantity: number; revenue: number; share: number }[]; listedCount: number; notSoldCount: number };
  paymentSplit: { cash: number; upi: number; card: number; other: number };
  channels: { counter: { orders: number; revenue: number }; qr: { orders: number; revenue: number } };
  orderTypes: Record<string, { orders: number; revenue: number }>;
  staff: StaffStat[];
  leakage: {
    discounts: { amount: number; orders: number; percentOfSales: number };
    cancelled: { count: number; amount: number };
    refunded: { count: number; amount: number };
    unpaid: { count: number; amount: number };
    recentDiscounts: { at: string; date: string; orderNumber: number | null; by: string; amount: number; percent: number }[];
    recentCancellations: { at: string; date: string; orderNumber: number | null; by: string; reason: string; amount: number; wasPaid: boolean }[];
  };
  closing: null | {
    date: string;
    isLive: boolean;
    asOf: string | null;
    collected: number;
    cash: { amount: number; orders: number };
    upi: { amount: number; orders: number };
    card: { amount: number; orders: number };
    other: { amount: number; orders: number };
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
}

/** Dashboard hero: aaj (abhi tak) vs kal isi time tak vs pichle hafte isi din */
export interface TodayCompare {
  asOf: string;
  today: PeriodTotals;
  yesterday: PeriodTotals;
  lastWeek: PeriodTotals;
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
  // ADDED (2026-10-09): Reports batch 1
  async getInsights(period: InsightPeriod): Promise<Insights> {
    const res = await apiClient.get('/analytics/insights', { params: { period } });
    return res.data.data;
  },
  async getTodayCompare(): Promise<TodayCompare> {
    const res = await apiClient.get('/analytics/today-compare');
    return res.data.data;
  },
  /** CSV text (Excel-ready, UTF-8 BOM ke saath) — lib/share-csv.ts isse file bana ke share karta hai */
  async exportCsv(period: InsightPeriod, type: 'orders' | 'items'): Promise<string> {
    const res = await apiClient.get('/analytics/export', {
      params: { period, type },
      // CSV JSON nahi hai → axios ka default parse chupchaap string hi chhod deta hai,
      // aur 400/403 ka JSON error body parse hota hai (getErrorMessage sahi message dikhaye)
      responseType: 'text',
      timeout: 30000, // 30 din ka export bada ho sakta hai (Render pe dheema)
    });
    return String(res.data);
  },
};