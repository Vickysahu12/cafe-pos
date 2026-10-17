// features/organization/organization.api.ts
// USE CASE: Typed API calls for Organization module — outlet get/update.
// CONNECTED TO: apiClient. Used by settings.tsx, outlet-edit.tsx.

import { apiClient } from '../../lib/api-client';

export interface OutletDetails {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  gstNumber: string | null;
  // ADDED (2026-10-11): DELIVERY settings
  deliveryEnabled?: boolean;
  deliveryCharge?: number;
  deliveryMinOrder?: number;
  deliveryArea?: string | null;
  // ADDED (2026-10-17): SOLO / TEAM (null = abhi chuna nahi) + online orders status (server ka hisaab)
  workMode?: WorkMode | null;
  ordering?: OnlineOrdering;
  // ADDED (2026-10-18): UPI QR — verifiedAt null = Owner ne ₹1 test nahi kiya → QR band
  upiId?: string | null;
  upiName?: string | null;
  upiVerifiedAt?: string | null;
}

/** ADDED (2026-10-17) */
export type WorkMode = 'SOLO' | 'TEAM';
/** ADDED (2026-10-17): pausedUntil null + open false = "jab tak koi wapas na khole" */
export interface OnlineOrdering {
  open: boolean;
  pausedUntil: string | null;
}

export const organizationApi = {
  async getOutlet(): Promise<OutletDetails> {
    const res = await apiClient.get('/organization/outlet');
    return res.data.data;
  },
  async updateOutlet(
    payload: Partial<Pick<OutletDetails, 'name' | 'address' | 'phone' | 'gstNumber' | 'deliveryEnabled' | 'deliveryCharge' | 'deliveryMinOrder' | 'deliveryArea'>>
  ): Promise<OutletDetails> {
    const res = await apiClient.patch('/organization/outlet', payload);
    return res.data.data;
  },
  /** ADDED (2026-10-17): Owner — "Just me" / "With staff". 409 STAFF_EXISTS agar active staff hai */
  async setWorkMode(workMode: WorkMode): Promise<OutletDetails> {
    const res = await apiClient.patch('/organization/outlet/work-mode', { workMode });
    return res.data.data;
  },
  /** ADDED (2026-10-18): Owner — UPI ID set (null = hatao). Naya ID = verify dobara */
  async setUpi(upiId: string | null, upiName?: string): Promise<OutletDetails> {
    const res = await apiClient.patch('/organization/outlet/upi', { upiId, upiName });
    return res.data.data;
  },
  /** ADDED (2026-10-18): Owner ne ₹1 khud ko bheja aur naam sahi aaya */
  async verifyUpi(): Promise<OutletDetails> {
    const res = await apiClient.post('/organization/outlet/upi/verify');
    return res.data.data;
  },
  /** ADDED (2026-10-17): online orders pause (30/60/120 min ya bina minutes = jab tak na kholo) / resume */
  async setOnlineOrders(paused: boolean, minutes?: 30 | 60 | 120): Promise<OnlineOrdering> {
    const res = await apiClient.patch('/organization/outlet/online-orders', { paused, minutes });
    return res.data.data;
  },
};