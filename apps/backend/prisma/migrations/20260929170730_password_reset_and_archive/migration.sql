-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- DropIndex
DROP INDEX "email_verifications_userId_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_verifications" ADD COLUMN     "purpose" "OtpPurpose" NOT NULL DEFAULT 'EMAIL_VERIFY';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "email_verifications_userId_purpose_idx" ON "email_verifications"("userId", "purpose");
