// Mirrors the Prisma `role` enum — kept here so frontend/mobile
// doesn't need to import the full Prisma client just for this
export type UserRole = "OWNER" | "MANAGER" | "CASHIER" | "CHEF";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  outletId: string;
  organizationId: string;
}

// Shape of the JWT access token payload
export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
  outletId: string;
  organizationId: string;
}