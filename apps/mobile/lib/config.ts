// lib/config.ts
// USE CASE: Central place for environment config — API base URL.
// CONNECTED TO: lib/api-client.ts uses this to build every request.
//
// FIX (2026-09-29): pehle yahan LAN IP hardcoded tha
// ('http://10.142.86.220:3000/api/v1') — production build bhi usi laptop ke IP
// pe jaati, aur Android release builds plain HTTP block karte hain. Ab URL
// EXPO_PUBLIC_API_URL env var se aata hai:
//   - local dev:  apps/mobile/.env.local  →  EXPO_PUBLIC_API_URL=http://<laptop-ip>:3000/api/v1
//   - production: EAS build profile env   →  EXPO_PUBLIC_API_URL=https://api.<your-domain>/api/v1
// (EXPO_PUBLIC_* vars build time pe bundle mein inline hote hain — secret kabhi mat daalna.)

const envUrl = process.env.EXPO_PUBLIC_API_URL;

if (!envUrl && !__DEV__) {
  // Release build bina URL ke bani — turant pata chalna chahiye, silently localhost pe nahi
  throw new Error('EXPO_PUBLIC_API_URL is not set for this build');
}

if (envUrl && !__DEV__ && !envUrl.startsWith('https://')) {
  // Production mein token plain HTTP pe kabhi nahi jaana chahiye
  throw new Error('EXPO_PUBLIC_API_URL must use https:// in release builds');
}

export const API_BASE_URL = (envUrl ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
