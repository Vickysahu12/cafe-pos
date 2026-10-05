// features/reviews/reviews.api.ts
// ADDED (2026-10-05): REVIEW BOOSTER — Owner/Manager APIs (backend: /api/v1/reviews).
// CONNECTED TO: app/(admin)/reviews.tsx

import { apiClient } from '../../lib/api-client';

export type ReviewSource = 'CARD' | 'BILL' | 'STATUS';

export interface ReviewSummary {
  googleReviewUrl: string | null;
  slug: string | null;
  outletName: string | null;
  days: number;
  cardScans: number;
  googleTaps: number;
  privateMessages: number;
  unread: number;
}

export interface FeedbackItem {
  id: string;
  message: string;
  name: string | null;
  source: ReviewSource;
  createdAt: string;
  readAt: string | null;
  orderId: string | null;
}

export const reviewsApi = {
  async getSummary(days: 7 | 30 | 90 = 30): Promise<ReviewSummary> {
    const res = await apiClient.get('/reviews/summary', { params: { days } });
    return res.data.data;
  },
  /** null = link hatao */
  async saveGoogleReviewUrl(googleReviewUrl: string | null): Promise<{ googleReviewUrl: string | null }> {
    const res = await apiClient.put('/reviews/settings', { googleReviewUrl });
    return res.data.data;
  },
  async listFeedback(): Promise<FeedbackItem[]> {
    const res = await apiClient.get('/reviews/feedback');
    return res.data.data;
  },
  async markAllRead(): Promise<void> {
    await apiClient.post('/reviews/feedback/read-all');
  },
};
