import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  PORT: z.string().default("3000"), // FIX (2026-09-29): 5000 → 3000, server.ts/mobile/web sab 3000 expect karte the
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"), // ← add
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email"), // ← add
  // Comma-separated list of allowed browser origins (mobile app aur curl/server
  // calls Origin header hi nahi bhejte, unhe ye affect nahi karta)
  ALLOWED_ORIGINS: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;