-- ADDED (2026-10-18): WhatsApp delivery link (delivery boy bina app ke "Delivered" dabata hai)

CREATE TABLE "delivery_people" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_people_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "delivery_people_outletId_phone_key" ON "delivery_people"("outletId", "phone");
CREATE INDEX "delivery_people_outletId_idx" ON "delivery_people"("outletId");
ALTER TABLE "delivery_people" ADD CONSTRAINT "delivery_people_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "deliveryPersonId" TEXT;
ALTER TABLE "orders" ADD COLUMN "deliveryPersonName" TEXT;
ALTER TABLE "orders" ADD COLUMN "deliveryLinkHash" TEXT;
ALTER TABLE "orders" ADD COLUMN "deliveryLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "deliverySentAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "deliveryIssue" TEXT;
ALTER TABLE "orders" ADD COLUMN "deliveryIssueAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "deliveryCollected" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "deliveryCollectedMethod" "PaymentMethod";
ALTER TABLE "orders" ADD COLUMN "deliveryCashSettledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "orders_deliveryLinkHash_key" ON "orders"("deliveryLinkHash");
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryPersonId_fkey"
    FOREIGN KEY ("deliveryPersonId") REFERENCES "delivery_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
