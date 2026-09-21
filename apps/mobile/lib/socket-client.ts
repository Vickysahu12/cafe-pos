// lib/socket.ts
// USE CASE: Socket.io client connection — Chef's KDS board uses this to receive
//           real-time order events. Connects with the same JWT access token used for
//           REST calls, matching the backend's socket-auth.ts handshake verification.
// CONNECTED TO: app/(chef)/kds.tsx. lib/config.ts for the base URL, lib/storage.ts for the token.

import { io, Socket } from 'socket.io-client';
import { storage } from './storage';
import { API_BASE_URL } from './config';

let socket: Socket | null = null;

// The REST base URL ends in "/api/v1" — Socket.io connects to the bare server root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await storage.getAccessToken();
  socket = io(SOCKET_URL, {
    auth: { token },
    //transports: ['websocket'], // skip long-polling fallback, faster on mobile
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}