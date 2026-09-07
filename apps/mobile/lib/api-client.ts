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

// On 401 (expired access token), try refreshing once, then retry the original request
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshing) {
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshRes = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = refreshRes.data?.data?.accessToken;
        if (newToken) {
          await storage.setAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          isRefreshing = false;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        isRefreshing = false;
        await storage.clearAccessToken();
        return Promise.reject(refreshError);
      }
    }
    isRefreshing = false;
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