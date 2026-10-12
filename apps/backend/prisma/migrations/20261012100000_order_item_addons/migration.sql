-- FIX (2026-10-12): add-on naam order item pe save (KDS + bill pe dikhane ke liye)
ALTER TABLE "order_items" ADD COLUMN "addonNames" TEXT;

-- FIX (2026-10-12): product delete check / FK ke liye index
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");
