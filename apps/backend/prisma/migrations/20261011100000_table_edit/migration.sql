-- ADDED (2026-10-11): TABLE EDIT — soft delete + timestamps (additive, purane rows ko default milta hai)
ALTER TABLE "tables" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
