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

  // DPDP Act, 2023 — proof that notice was shown and consent was given at
  // signup. Sent by the client at the exact moment the checkbox is checked
  // (see register.tsx). Validated here so a request can never skip this
  // field entirely or send a garbage/forged value — the endpoint rejects
  // registration outright without it, same as a missing password.
  consentAcceptedAt: z
    .string()
    .datetime({ message: "Invalid consent timestamp" })
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 5 * 60 * 1000,
      { message: "Consent timestamp cannot be in the future" }
    ),
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

// NOTE (follow-up, not yet implemented): staff created via CreateStaffSchema
// haven't personally consented to anything yet — the Owner filled this form on
// their behalf. For full DPDP compliance, add a one-time "accept Terms &
// Privacy Policy" step on a staff member's own first login, and validate/store
// consentAcceptedAt there the same way this schema does for the Owner.