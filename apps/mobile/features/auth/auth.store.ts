// features/auth/auth.store.ts
// USE CASE: Global auth state — current user, access token, and all auth actions
//           (register, verify OTP, resend OTP, login, logout).
// CONNECTED TO: app/index.tsx for redirect logic. app/(auth)/*.tsx screens call the actions.
//
// FIX: the backend now issues an opaque refresh token in the response body (no
// more HttpOnly cookie), and /auth/logout actually revokes it server-side. So:
//   - login/verifyEmail now store BOTH tokens, not just the access token.
//   - logout now calls the backend (best-effort) before clearing local state.
//   - a new setPendingVerification action lets login.tsx redirect straight to
//     OTP verification on an EMAIL_NOT_VERIFIED error, instead of dead-ending
//     on a banner with no way forward.

//
// FIX (2026-09-29):
//   - restoreSession: network error (WiFi down) pe ab logout NAHI hota — cached
//     user se app khulta hai. Logout sirf tab jab server bole session invalid hai.
//   - Session beech mein expire ho (refresh token revoke/expire) to api-client
//     `onSessionExpired` bulata hai → yahan state reset → _layout.tsx ka guard
//     login pe bhej deta hai. Pehle user broken screen pe atka rehta tha.
//   - Login/verify pe user profile cache hota hai (storage.setUser).

import { create } from 'zustand';
import { storage } from '../../lib/storage';
import { isNetworkError, setOnSessionExpired } from '../../lib/api-client';
import { disconnectSocket } from '../../lib/socket-client';
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
  /** Used by login.tsx when the backend returns EMAIL_NOT_VERIFIED, so the
   *  existing verify-otp screen (built for the register flow) can be reused
   *  for "you tried to log in but never verified" too. */
  setPendingVerification: (userId: string, email: string) => void;
  /** FIX (2026-09-30): staff first-login consent (DPDP) */
  acceptConsent: () => Promise<void>;
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
      await storage.setUser(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      // Offline start: cached user ho to wahi use karo, tokens mat udao —
      // WiFi wapas aate hi normal API calls chal padengi
      if (isNetworkError(err)) {
        const cachedUser = await storage.getUser<AuthUser>();
        if (cachedUser) {
          set({ user: cachedUser, isAuthenticated: true, isLoading: false });
          return;
        }
      }
      // getMe already went through apiClient's own refresh attempt (see
      // api-client.ts) — if we're still here, the refresh token is dead too.
      await storage.clearSession();
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
    await storage.setRefreshToken(result.refreshToken);
    await storage.setUser(result.user);
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
    await storage.setRefreshToken(result.refreshToken);
    await storage.setUser(result.user);
    set({ user: result.user, isAuthenticated: true });
  },

  logout: async () => {
    const refreshToken = await storage.getRefreshToken();
    try {
      // Best-effort: revoke the refresh token server-side so it can't be reused
      // if it ever leaked. Even if this call fails (no network, etc.), we still
      // clear everything locally below — a failed remote revoke shouldn't trap
      // the user in a logged-in state on their own device.
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ignore — local logout still proceeds
    } finally {
      // FIX (2026-09-29): socket bhi band — pehle logout ke baad bhi purana
      // socket (purane user ke rooms ke saath) zinda rehta tha
      disconnectSocket();
      await storage.clearSession();
      set({ user: null, isAuthenticated: false });
    }
  },

  setPendingVerification: (userId, email) => {
    set({ pendingUserId: userId, pendingEmail: email });
  },

  // FIX (2026-09-30): consent screen accept karne ke baad user state update
  acceptConsent: async () => {
    const consentAcceptedAt = await authApi.acceptConsent();
    const user = get().user;
    if (!user) return;
    const updated = { ...user, consentAcceptedAt };
    await storage.setUser(updated);
    set({ user: updated });
  },
}));

// FIX (2026-09-29): session server-side khatam (refresh token revoked/expired,
// ya staff deactivate) → state reset, root layout ka guard login pe bhejega
setOnSessionExpired(() => {
  disconnectSocket();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});