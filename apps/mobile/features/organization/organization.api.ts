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
};