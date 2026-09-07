// features/auth/auth.api.ts
// USE CASE: Typed API calls for the Auth module — matches backend's exact request/response shapes.
// CONNECTED TO: apiClient (lib/api-client.ts). Called from features/auth/auth.store.ts and Setup screen.

import { apiClient } from '../../lib/api-client';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'CHEF';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface RegisterPayload {
  organizationName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  outletName: string;
  outletAddress: string;
}

export interface RegisterResponse {
  userId: string;
  outlet: { id: string; name: string; slug: string };
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export const authApi = {
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const res = await apiClient.post('/auth/register', payload);
    return res.data.data;
  },

  async verifyEmail(userId: string, otp: string): Promise<AuthResult> {
    const res = await apiClient.post('/auth/verify-email', { userId, otp });
    return res.data.data;
  },

  async resendOtp(userId: string): Promise<void> {
    await apiClient.post('/auth/resend-otp', { userId });
  },

  async login(payload: LoginPayload): Promise<AuthResult> {
    const res = await apiClient.post('/auth/login', payload);
    return res.data.data;
  },

  async getMe(): Promise<AuthUser> {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },

  // NAYA — Setup checklist screen aur future Staff List screen use karenge
  async getStaffList(): Promise<StaffMember[]> {
    const res = await apiClient.get('/auth/staff');
    return res.data.data;
  },
};