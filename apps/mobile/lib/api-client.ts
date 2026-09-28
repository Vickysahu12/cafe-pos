// lib/api-client.ts
// USE CASE: Single axios instance for all API calls — attaches JWT automatically,
//           handles 401 by trying a silent token refresh once before giving up.
// CONNECTED TO: Every features/*/*.api.ts file uses this instead of raw axios/fetch.

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

let isRefreshing = false;
// Requests that hit a 401 WHILE a refresh is already in flight (e.g. Dashboard's
// Promise.all firing 5 authenticated calls at once with an expired token) wait
// here instead of failing outright, then get replayed once the single refresh
// call resolves — so only one /auth/refresh request ever goes out at a time,
// but all 5 original requests still succeed.
let pendingRequests: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(callback: (token: string | null) => void) {
  pendingRequests.push(callback);
}

function onRefreshResolved(token: string | null) {
  pendingRequests.forEach((callback) => callback(token));
  pendingRequests = [];
}

// On 401 (expired access token), try refreshing once, then retry the original request
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Someone else already started the refresh — wait for it instead of
        // firing a second /auth/refresh call or failing this request outright.
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (!newToken) {
              reject(error);
              return;
            }
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshRes = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = refreshRes.data?.data?.accessToken;
        if (!newToken) {
          throw new Error('No access token returned from refresh');
        }
        await storage.setAccessToken(newToken);
        isRefreshing = false;
        onRefreshResolved(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshResolved(null); // wakes up every queued request so they reject instead of hanging forever
        await storage.clearAccessToken();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// Pulls the backend's human-readable message out of an error response, with a safe fallback
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Can't reach the server. Check your WiFi connection.";
    return err.response.data?.message || 'Something went wrong. Please try again.';
  }
  return 'Something went wrong. Please try again.';
}