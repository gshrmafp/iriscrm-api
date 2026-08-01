-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);
