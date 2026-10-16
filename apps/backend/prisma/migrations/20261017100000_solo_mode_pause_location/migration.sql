-- ADDED (2026-10-17): Solo/Team mode, online orders pause, delivery location pin

CREATE TYPE "WorkMode" AS ENUM ('SOLO', 'TEAM');

ALTER TABLE "outlets" ADD COLUMN "workMode" "WorkMode";
ALTER TABLE "outlets" ADD COLUMN "ordersPausedUntil" TIMESTAMP(3);

-- Purane cafes jinke paas staff hai = TEAM (unka flow bilkul nahi badalta). Bina staff wale
-- null rehte hain → Dashboard pe ek baar "Just me / With staff" poocha jaayega.
UPDATE "outlets" o SET "workMode" = 'TEAM'
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."outletId" = o."id" AND u."role" <> 'OWNER');

ALTER TABLE "orders" ADD COLUMN "deliveryLat" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "deliveryLng" DOUBLE PRECISION;
