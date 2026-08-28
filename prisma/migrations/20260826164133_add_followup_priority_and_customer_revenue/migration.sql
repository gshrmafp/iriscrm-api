-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "revenue" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "lead_follow_ups" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "priority" "FollowUpPriority" NOT NULL DEFAULT 'MEDIUM';
