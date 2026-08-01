-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'OVERDUE', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'QUERY_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'QUERY_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE 'QUERY_PRIORITY_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'QUERY_ATTACHMENT_UPLOADED';
ALTER TYPE "NotificationType" ADD VALUE 'QUERY_DUE_DATE_UPDATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SalesQueryStatus" ADD VALUE 'WAITING_FOR_INTERNAL_TEAM';
ALTER TYPE "SalesQueryStatus" ADD VALUE 'QUOTATION_PREPARATION';

-- AlterTable
ALTER TABLE "activity_log" ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "browser" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "field" TEXT,
ADD COLUMN     "fromValue" JSONB,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "regionLoc" TEXT,
ADD COLUMN     "toValue" JSONB,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "query_activities" ADD COLUMN     "field" TEXT,
ADD COLUMN     "fromValue" TEXT,
ADD COLUMN     "toValue" TEXT;

-- AlterTable
ALTER TABLE "query_comments" ADD COLUMN     "emojiReactions" JSONB,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedBy" TEXT;

-- AlterTable
ALTER TABLE "sales_queries" ADD COLUMN     "address" TEXT,
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "budget" DECIMAL(14,2),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "expectedDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "gpsLatitude" DECIMAL(10,7),
ADD COLUMN     "gpsLongitude" DECIMAL(10,7),
ADD COLUMN     "gstNumber" TEXT,
ADD COLUMN     "labels" JSONB,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "slaBreached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slaDeadline" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "tags" JSONB;

-- CreateTable
CREATE TABLE "query_follow_ups" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "reminderMinutes" INTEGER,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "channel" TEXT,
    "customerResponse" TEXT,
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "rescheduledFrom" TEXT,
    "rescheduledCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "query_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_follow_ups_queryId_idx" ON "query_follow_ups"("queryId");

-- CreateIndex
CREATE INDEX "query_follow_ups_scheduledAt_idx" ON "query_follow_ups"("scheduledAt");

-- CreateIndex
CREATE INDEX "query_follow_ups_status_idx" ON "query_follow_ups"("status");

-- CreateIndex
CREATE INDEX "query_follow_ups_assignedToId_idx" ON "query_follow_ups"("assignedToId");

-- CreateIndex
CREATE INDEX "activity_log_actorId_idx" ON "activity_log"("actorId");

-- CreateIndex
CREATE INDEX "activity_log_createdAt_idx" ON "activity_log"("createdAt");

-- CreateIndex
CREATE INDEX "query_activities_actorId_idx" ON "query_activities"("actorId");

-- CreateIndex
CREATE INDEX "query_comments_authorId_idx" ON "query_comments"("authorId");

-- CreateIndex
CREATE INDEX "sales_queries_assignedToId_idx" ON "sales_queries"("assignedToId");

-- CreateIndex
CREATE INDEX "sales_queries_priority_idx" ON "sales_queries"("priority");

-- CreateIndex
CREATE INDEX "sales_queries_dueDate_idx" ON "sales_queries"("dueDate");

-- CreateIndex
CREATE INDEX "sales_queries_createdAt_idx" ON "sales_queries"("createdAt");

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "sales_queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_follow_ups" ADD CONSTRAINT "query_follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
