// features/auth/auth.api.ts
// USE CASE: Typed API calls for the Auth module.
// CONNECTED TO: apiClient. Called from auth.store.ts, Setup screen, and now Staff screen.
//
// FIX: AuthResult was missing `refreshToken` — the backend's login/verifyEmail
// responses are shaped { user, accessToken, refreshToken } now (opaque,
// DB-backed refresh tokens, no more cookie), so the type needs to carry it or
// auth.store.ts has nothing valid to pass to storage.setRefreshToken().
// Also added logout(), since /auth/logout now actually revokes the token
// server-side instead of being a purely local, no-op-on-the-backend action.

import { apiClient } from '../../lib/api-client';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'CHEF';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  outletId: string;
  outletName?: string;
  // FIX (2026-09-30): null = user ne abhi tak Terms/Privacy accept nahi kiye
  // (Owner ke banaye staff accounts) → app/index.tsx consent screen dikhata hai
  consentAcceptedAt?: string | null;
}

export interface RegisterPayload {
  organizationName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  outletName: string;
  outletAddress: string;
  consentAcceptedAt: string;
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
  refreshToken: string;
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

  // NAYA — revokes this device's refresh token server-side. Best-effort call
  // from auth.store.ts's logout() action; local state is cleared regardless of
  // whether this succeeds.
  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken });
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
      consentAcceptedAt: data.consentAcceptedAt ?? null,
    };
  },

  /** FIX (2026-09-30): staff ka first-login consent record karo (DPDP) */
  async acceptConsent(): Promise<string> {
    const res = await apiClient.post('/auth/consent');
    return res.data.data.consentAcceptedAt;
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

  // ── FIX (2026-09-29): password reset + account deletion ──────────

  /** Forgot password step 1 — backend hamesha same message deta hai (account ho ya na ho) */
  async forgotPassword(email: string): Promise<string> {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data.message;
  },

  /** Forgot password step 2 — OTP + naya password */
  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { email, otp, newPassword });
  },

  /** Logged-in password change — naye tokens aate hain (baaki devices logout) */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await apiClient.post('/auth/change-password', { currentPassword, newPassword });
    return res.data.data;
  },

  /** Owner/Manager staff deactivate/reactivate kare (backend endpoint pehle se tha, UI nahi thi) */
  async setStaffStatus(staffId: string, isActive: boolean): Promise<void> {
    await apiClient.patch(`/auth/staff/${staffId}/status`, { isActive });
  },

  /** Owner/Manager staff ka password set kare */
  async resetStaffPassword(staffId: string, newPassword: string): Promise<void> {
    await apiClient.post(`/auth/staff/${staffId}/reset-password`, { newPassword });
  },

  /** Owner poora cafe account delete kare — PERMANENT */
  async deleteAccount(password: string): Promise<void> {
    await apiClient.delete('/auth/account', { data: { password, confirmText: 'DELETE' } });
  },
};