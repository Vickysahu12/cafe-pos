-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('CARD', 'BILL', 'STATUS');

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "googleReviewUrl" TEXT;

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "name" TEXT,
    "orderId" TEXT,
    "source" "ReviewSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_stats" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cardViews" INTEGER NOT NULL DEFAULT 0,
    "googleClicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_outletId_createdAt_idx" ON "feedback"("outletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_stats_outletId_date_key" ON "review_stats"("outletId", "date");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_stats" ADD CONSTRAINT "review_stats_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
