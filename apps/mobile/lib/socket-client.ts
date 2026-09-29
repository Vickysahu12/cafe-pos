// lib/socket.ts
// USE CASE: Socket.io client connection — Chef's KDS board uses this to receive
//           real-time order events. Connects with the same JWT access token used for
//           REST calls, matching the backend's socket-auth.ts handshake verification.
// CONNECTED TO: app/(chef)/kds.tsx. lib/config.ts for the base URL, lib/storage.ts for the token.
//               lib/api-client.ts ka refreshAccessToken() — expired token pe.
//
// FIX (2026-09-29): "KDS 15 MINUTE BAAD MAR JAATA HAI" BUG.
// Pehle token sirf pehli baar connect karte waqt `auth: { token }` mein fix ho
// jaata tha. Access token 15 min mein expire hota hai — uske baad WiFi blip ya
// server redeploy pe socket reconnect karta to wahi PURANA token bhejta, backend
// reject karta ("Invalid or expired token"), aur Socket.io middleware-rejection
// ke baad khud retry nahi karta. Result: Chef ke KDS pe naye orders aana band,
// bina kisi error ke.
// Ab:
//   1. `auth` ek function hai — HAR (re)connect pe storage se LATEST token padhta hai.
//   2. Agar server token reject kare → refreshAccessToken() → dobara connect.
//   3. Refresh bhi fail (session sach mein khatam) → api-client logout flow chalata hai.

import { io, Socket } from 'socket.io-client';
import { storage } from './storage';
import { API_BASE_URL } from './config';
import { refreshAccessToken, SessionExpiredError } from './api-client';

let socket: Socket | null = null;

// The REST base URL ends in "/api/v1" — Socket.io connects to the bare server root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

// Backend socket-auth.ts yeh messages bhejta hai
const TOKEN_ERRORS = ['Invalid or expired token', 'No auth token provided'];

export async function connectSocket(): Promise<Socket> {
  if (socket) {
    // Pehle se bana hua socket (connected ya reconnect kar raha) — wahi do,
    // naya mat banao warna duplicate listeners/connections ban jaate
    if (!socket.connected && !socket.active) socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    // Function form: har handshake pe fresh token (dekho FIX note upar)
    auth: (cb) => {
      storage.getAccessToken().then((token) => cb({ token }));
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    //transports: ['websocket'], // skip long-polling fallback, faster on mobile
  });

  let refreshing = false;
  socket.on('connect_error', async (err) => {
    // Normal network errors pe socket.io khud retry karta hai (socket.active = true).
    // Sirf server-side auth rejection pe humein khud kuch karna hai.
    if (!socket || socket.active || refreshing) return;
    if (!TOKEN_ERRORS.includes(err.message)) return; // e.g. "Account deactivated"

    refreshing = true;
    try {
      await refreshAccessToken();
      socket?.connect(); // naya token auth() function se apne aap uthega
    } catch (refreshErr) {
      if (!(refreshErr instanceof SessionExpiredError)) {
        // Network issue during refresh — thodi der baad dobara try
        setTimeout(() => socket?.connect(), 5000);
      }
      // SessionExpiredError: api-client ne logout flow chala diya hai
    } finally {
      refreshing = false;
    }
  });

  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}
