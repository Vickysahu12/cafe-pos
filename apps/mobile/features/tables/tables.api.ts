// features/tables/tables.api.ts
// USE CASE: Typed API calls for Tables module.
// CONNECTED TO: apiClient. Used by Setup screen, Tables screen.

import { apiClient } from '../../lib/api-client';

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
}

export const tablesApi = {
  async getTables(): Promise<Table[]> {
    const res = await apiClient.get('/tables');
    return res.data.data;
  },
  // NAYA — Tables screen ka "Add Table" use karega
  async createTable(payload: { tableNumber: string; capacity: number }): Promise<Table> {
    const res = await apiClient.post('/tables', payload);
    return res.data.data;
  },
};