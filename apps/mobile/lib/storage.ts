// lib/storage.ts
// USE CASE: Secure storage wrapper for JWT access token (refresh token stays in HttpOnly cookie, backend-side).
// CONNECTED TO: features/auth/auth.store.ts reads/writes tokens through this.

import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'cafe_pos_access_token';

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
};