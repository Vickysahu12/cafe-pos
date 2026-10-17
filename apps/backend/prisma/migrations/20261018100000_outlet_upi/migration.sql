-- ADDED (2026-10-18): UPI QR with exact amount (Owner-only, ₹1 self-verify)
ALTER TABLE "outlets" ADD COLUMN "upiId" TEXT;
ALTER TABLE "outlets" ADD COLUMN "upiName" TEXT;
ALTER TABLE "outlets" ADD COLUMN "upiVerifiedAt" TIMESTAMP(3);
