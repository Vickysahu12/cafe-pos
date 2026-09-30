// lib/api-client.ts
// USE CASE: Single axios instance for all API calls — attaches JWT automatically,
//           handles 401 by trying a silent token refresh once before giving up.
// CONNECTED TO: Every features/*/*.api.ts file uses this instead of raw axios/fetch.
//               lib/socket-client.ts bhi refreshAccessToken() use karta hai.
//
// FIX: the backend no longer issues the refresh token as an HttpOnly cookie — it's
// now an opaque, HMAC-hashed-in-DB token returned in the response body (see
// refresh-token.service.ts). So this interceptor must read it from secure storage
// and send it explicitly in the request body, not rely on withCredentials.
//
// FIX (2026-09-29):
// 1. Refresh logic ek exported `refreshAccessToken()` function mein nikaali —
//    socket-client.ts ko bhi token refresh karna padta hai (KDS socket 15 min baad
//    mar jaata tha), aur dono ek hi single-flight promise share karte hain, taaki
//    REST + socket ek saath refresh maangein to bhi sirf EK /auth/refresh call jaaye.
// 2. Refresh fail hone pe (session sach mein khatam) `onSessionExpired` callback
//    chalta hai — auth.store usse user ko logout state mein daalta hai. Pehle
//    tokens clear ho jaate the lekin store "logged in" hi rehta tha, to user
//    errors wali screen pe atka rehta tha jab tak app restart na kare.
// 3. Network error (WiFi gaya) pe tokens KABHI clear nahi hote — sirf tab jab
//    server saaf bole ki refresh token invalid hai (401).

import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from './config';
import { storage } from './storage';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Attach access token to every outgoing request
apiClient.interceptors.request.use(async (config) => {
  const token = await storage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// auth.store yahan apna handler register karta hai (direct import se circular
// dependency banti: auth.store → auth.api → api-client → auth.store)
let sessionExpiredHandler: (() => void) | null = null;
export function setOnSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

// Error jo batata hai ki refresh token server ne REJECT kiya (network issue nahi)
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

let refreshPromise: Promise<string> | null = null;

/**
 * USE CASE: Naya access token laata hai. Single-flight: agar ek refresh pehle se
 * chal raha hai (Dashboard ka Promise.all, ya socket + REST ek saath), sab usi
 * promise ka wait karte hain. Resolve → naya token. Reject → SessionExpiredError
 * (login dobara chahiye) ya network error (tokens safe rehte hain, baad mein retry).
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) throw new SessionExpiredError();

    try {
      const refreshRes = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: 15000 }
      );
      const newAccessToken = refreshRes.data?.data?.accessToken;
      if (!newAccessToken) throw new SessionExpiredError();

      // Backend does NOT rotate the refresh token on /auth/refresh (it only
      // returns a new accessToken) — so we only need to update this one value.
      await storage.setAccessToken(newAccessToken);
      return newAccessToken as string;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const isRejectedByServer = err instanceof SessionExpiredError || status === 401 || status === 403;
      if (isRejectedByServer) {
        // The refresh token itself is invalid/expired/revoked — nothing left to
        // try. Clear BOTH tokens so the app doesn't keep retrying a dead session.
        await storage.clearSession();
        sessionExpiredHandler?.();
        throw new SessionExpiredError();
      }
      // Network/5xx error — tokens rakho, user logged in rahe
      throw err;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// FIX (2026-09-29): in routes ka 401 "galat password/OTP" hota hai, "token
// expire" nahi — pehle login pe galat password dalne se bhi refresh try hota
// tha aur user ko "Invalid email or password" ki jagah generic error dikhta tha
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/verify-email', '/auth/resend-otp', '/auth/refresh', '/auth/logout'];

// On 401 (expired access token), try refreshing once, then retry the original request
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    const isAuthRoute = NO_REFRESH_PATHS.some((p) => originalRequest?.url?.startsWith(p));

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      const newAccessToken = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    }
    return Promise.reject(error);
  }
);

// Pulls the backend's human-readable message out of an error response, with a safe fallback
export function getErrorMessage(err: unknown): string {
  if (err instanceof SessionExpiredError) return err.message;
  if (axios.isAxiosError(err)) {
    // FIX (2026-09-30): "WiFi" galat tha — phone 4G pe ho to confuse karta tha
    if (!err.response) return "Can't reach the server. Check your internet connection and try again.";
    return err.response.data?.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}

// FIX (2026-09-29): network error pehchanne ka helper — auth.store isse decide
// karta hai ki app start pe offline hone par user ko logout NAHI karna
export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

// New helper — pulls the structured { code, userId } the backend now attaches
// to errors (see error-handler.ts), for screens that need to branch on WHY a
// request failed, not just show a message (e.g. login.tsx redirecting to OTP
// verification on EMAIL_NOT_VERIFIED).
export function getErrorCode(err: unknown): { code?: string; userId?: string } {
  if (axios.isAxiosError(err) && err.response?.data?.error) {
    const { code, userId } = err.response.data.error as { code?: string; userId?: string };
    return { code, userId };
  }
  return {};
}
