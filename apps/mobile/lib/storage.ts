// lib/storage.ts
// USE CASE: Secure storage wrapper for JWT tokens.
// CONNECTED TO: features/auth/auth.store.ts reads/writes tokens through this.
//
// FIX: the backend no longer issues the refresh token as an HttpOnly cookie —
// it's now an opaque token returned in the response body (see
// refresh-token.service.ts on the backend), so it needs to live in secure
// storage on this side too, same as the access token.
//
// FIX (2026-09-29): logged-in user ka profile (id, naam, role, outlet) bhi cache
// hota hai. Kyun: app start pe agar cafe ka WiFi down ho, pehle /auth/me fail
// hota tha aur app user ko LOGOUT kar deta tha — counter pe cashier ko dobara
// login karna padta. Ab offline start pe cached user se hi role-based screen khulti hai.

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'cafe_pos_access_token';
const REFRESH_TOKEN_KEY = 'cafe_pos_refresh_token';
const USER_KEY = 'cafe_pos_user';

export const storage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },
  async clearAccessToken(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async clearRefreshToken(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  // FIX (2026-09-29): cached user profile (dekho upar)
  async getUser<T>(): Promise<T | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setUser(user: unknown): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  /** Logout / session expire — tokens + cached user sab ek saath saaf */
  async clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};
