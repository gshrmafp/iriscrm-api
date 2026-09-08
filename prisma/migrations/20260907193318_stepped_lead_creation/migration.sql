-- AlterEnum
ALTER TYPE "DealType" ADD VALUE 'MAINTENANCE';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "discussionNote" TEXT,
ADD COLUMN     "qualificationPath" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "step1CompletedAt" TIMESTAMP(3),
ADD COLUMN     "step2CompletedAt" TIMESTAMP(3),
ADD COLUMN     "step3CompletedAt" TIMESTAMP(3),
ALTER COLUMN "contactName" DROP NOT NULL,
ALTER COLUMN "source" DROP NOT NULL;

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "initialQuotationAmount" DECIMAL(14,2),
ADD COLUMN     "initialQuotationDate" TIMESTAMP(3),
ADD COLUMN     "initialQuotationRef" TEXT;

-- Data migration: mark all existing leads as fully completed (step 3)
UPDATE "leads"
SET "currentStep" = 3,
    "step1CompletedAt" = "createdAt",
    "step2CompletedAt" = "createdAt",
    "step3CompletedAt" = "createdAt"
WHERE "contactName" IS NOT NULL;
