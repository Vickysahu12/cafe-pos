-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'SALE_REVERSAL', 'WASTAGE', 'COUNT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "costPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variantName" TEXT;

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantName" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "orderNumber" INTEGER,
    "countId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_lines_outletId_idx" ON "recipe_lines"("outletId");

-- CreateIndex
CREATE INDEX "recipe_lines_productId_idx" ON "recipe_lines"("productId");

-- CreateIndex
CREATE INDEX "recipe_lines_inventoryItemId_idx" ON "recipe_lines"("inventoryItemId");

-- CreateIndex
CREATE INDEX "stock_movements_outletId_createdAt_idx" ON "stock_movements"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_inventoryItemId_createdAt_idx" ON "stock_movements"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_orderId_idx" ON "stock_movements"("orderId");

-- CreateIndex
CREATE INDEX "stock_movements_countId_idx" ON "stock_movements"("countId");

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────
-- DATA (2026-10-09, haath se joda): purane free-text units → g | kg | ml | L | pcs.
-- Quantity same rehti hai (sirf naam normalise) — "litres" 20 = "L" 20. Na pehchane units
-- ("packets", "bottles") = pcs. utils/units.ts yahi 5 units samajhta hai.
-- ─────────────────────────────────────────────────────────
UPDATE "inventory_items" SET "unit" = CASE
  WHEN lower(trim("unit")) IN ('kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms') THEN 'kg'
  WHEN lower(trim("unit")) IN ('g', 'gm', 'gms', 'gram', 'grams', 'gr') THEN 'g'
  WHEN lower(trim("unit")) IN ('l', 'lt', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters') THEN 'L'
  WHEN lower(trim("unit")) IN ('ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters') THEN 'ml'
  ELSE 'pcs'
END;

-- Har purane item ki history ek OPENING entry se shuru ho (balance = abhi ka stock)
INSERT INTO "stock_movements" ("id", "outletId", "inventoryItemId", "type", "quantity", "balanceAfter", "unitCost", "note")
SELECT gen_random_uuid()::text, "outletId", "id", 'OPENING', "quantity", "quantity", 0, 'Stock before recipes were turned on'
FROM "inventory_items";
