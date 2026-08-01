/*
  Warnings:

  - Changed the type of `source` on the `leads` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PicklistType" AS ENUM ('LEAD_SOURCE', 'PRODUCT_INTEREST');

-- AlterTable: convert enum column to text in place, preserving existing data
ALTER TABLE "leads" ALTER COLUMN "source" TYPE TEXT USING "source"::TEXT;

-- DropEnum
DROP TYPE "LeadSource";

-- CreateTable
CREATE TABLE "picklist_options" (
    "id" TEXT NOT NULL,
    "listType" "PicklistType" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "picklist_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "picklist_options_listType_active_idx" ON "picklist_options"("listType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "picklist_options_listType_code_key" ON "picklist_options"("listType", "code");
