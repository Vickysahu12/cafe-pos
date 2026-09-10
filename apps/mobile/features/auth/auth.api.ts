// features/auth/auth.api.ts
// USE CASE: Typed API calls for the Auth module.
// CONNECTED TO: apiClient. Called from auth.store.ts, Setup screen, and now Staff screen.

import { apiClient } from '../../lib/api-client';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'CHEF';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  outletId: string;
  outletName?: string;
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

export interface CreateStaffPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'MANAGER' | 'CASHIER' | 'CHEF';
  outletId: string;
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
    const data = res.data.data;
    // /me returns a nested `outlet: {id, name}` shape — normalized here to the
    // same flat `outletId`/`outletName` shape login/verifyEmail return, so every
    // screen can rely on `user.outletId` regardless of which flow set it
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      outletId: data.outlet.id,
      outletName: data.outlet.name,
    };
  },

  async getStaffList(): Promise<StaffMember[]> {
    const res = await apiClient.get('/auth/staff');
    return res.data.data;
  },

  // NAYA — Staff create screen use karega
  async createStaff(payload: CreateStaffPayload): Promise<StaffMember> {
    const res = await apiClient.post('/auth/staff', payload);
    return res.data.data;
  },
};