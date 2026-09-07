// features/auth/auth.store.ts
// USE CASE: Global auth state — current user, access token, and all auth actions
//           (register, verify OTP, resend OTP, login, logout).
// CONNECTED TO: app/index.tsx for redirect logic. app/(auth)/*.tsx screens call the actions.

import { create } from 'zustand';
import { storage } from '../../lib/storage';
import { authApi, AuthUser, RegisterPayload } from './auth.api';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingUserId: string | null;
  pendingEmail: string | null;

  restoreSession: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  verifyEmail: (otp: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  pendingUserId: null,
  pendingEmail: null,

  restoreSession: async () => {
    const token = await storage.getAccessToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      await storage.clearAccessToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  register: async (payload) => {
    const result = await authApi.register(payload);
    set({ pendingUserId: result.userId, pendingEmail: payload.email });
  },

  verifyEmail: async (otp) => {
    const { pendingUserId } = get();
    if (!pendingUserId) throw new Error('No pending registration found. Please register again.');
    const result = await authApi.verifyEmail(pendingUserId, otp);
    await storage.setAccessToken(result.accessToken);
    set({ user: result.user, isAuthenticated: true, pendingUserId: null, pendingEmail: null });
  },

  resendOtp: async () => {
    const { pendingUserId } = get();
    if (!pendingUserId) throw new Error('No pending registration found.');
    await authApi.resendOtp(pendingUserId);
  },

  login: async (email, password) => {
    const result = await authApi.login({ email, password });
    await storage.setAccessToken(result.accessToken);
    set({ user: result.user, isAuthenticated: true });
  },

  logout: async () => {
    await storage.clearAccessToken();
    set({ user: null, isAuthenticated: false });
  },
}));