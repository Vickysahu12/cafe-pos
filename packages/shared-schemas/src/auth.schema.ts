import { z } from "zod";

// Owner registers Organization + first Outlet + their own account
export const RegisterOrganizationSchema = z.object({
  organizationName: z.string().min(2, "Organization name is too short"),
  ownerName: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  outletName: z.string().min(2, "Outlet name is too short"),
  outletAddress: z.string().min(5, "Address is too short"),
});
export type RegisterOrganizationInput = z.infer<typeof RegisterOrganizationSchema>;

// Login — email + password
export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// Owner/Manager creates a staff account (Cashier or Chef, or another Manager)
export const CreateStaffSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["MANAGER", "CASHIER", "CHEF"]), // Owner is created only via register
  outletId: z.string().uuid("Invalid outlet ID"),
});
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;


// Yeh design decisions dhyan se dekho:

// RegisterOrganizationSchema mein Organization + Outlet + Owner teeno ek saath create hote hain — kyunki tumhare PRD mein POST /register yehi karta hai (backend service mein hum ek Prisma transaction se teeno ko atomically create karenge, Phase 4 mein)
// CreateStaffSchema mein role sirf MANAGER | CASHIER | CHEF allow karta hai — OWNER yahan se create nahi ho sakta (sirf registration se ek Owner banta hai), yeh ek security guard hai schema level pe hi
// Phone regex Indian mobile number format check karta hai (6-9 se start, 10 digits)