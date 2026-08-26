// Internal type for the refresh token's JWT payload — only the backend
// ever decodes a refresh token, so this doesn't belong in shared-types
export interface RefreshTokenPayload {
  userId: string;
}

// Shape returned internally by auth.service.ts functions,
// consumed only by auth.controller.ts — not exposed to frontend/mobile
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
}