// features/audit/audit.api.ts
// USE CASE: Typed API calls for Audit module — Owner-only view of high-risk actions
// (order voids, discounts) for the "Zero-Theft Audit" feature.
// CONNECTED TO: apiClient. Used by audit-logs.tsx.

import { apiClient } from '../../lib/api-client';

export interface AuditLogEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  user: { name: string; role: string };
}

export const auditApi = {
  async getLogs(): Promise<AuditLogEntry[]> {
    const res = await apiClient.get('/audit/logs');
    return res.data.data;
  },
};