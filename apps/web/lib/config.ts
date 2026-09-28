// lib/config.ts
// USE CASE: Backend API base URL. Same backend the mobile app talks to — this hits
// only the public-menu routes, which need no authentication.
// CONNECTED TO: lib/api.ts

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';