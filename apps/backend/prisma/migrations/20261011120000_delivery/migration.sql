-- ADDED (2026-10-11): DELIVERY (cafe ki apni website se) — additive, default band
CREATE TYPE "DeliveryStatus" AS ENUM ('PLACED', 'OUT_FOR_DELIVERY', 'DELIVERED');

ALTER TABLE "outlets" ADD COLUMN "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveryCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "deliveryMinOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "deliveryArea" TEXT;

ALTER TABLE "orders" ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "deliveryCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "deliveryStatus" "DeliveryStatus";
