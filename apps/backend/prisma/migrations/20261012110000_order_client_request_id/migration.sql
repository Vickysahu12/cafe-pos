-- FIX (2026-10-12): QR website retry-safe key — same request dobara aaye to naya order nahi
ALTER TABLE "orders" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "orders_outletId_clientRequestId_key" ON "orders"("outletId", "clientRequestId");
