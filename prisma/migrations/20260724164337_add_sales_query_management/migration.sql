-- CreateEnum
CREATE TYPE "DepartmentMemberRole" AS ENUM ('MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('WALK_IN', 'SCHEDULED', 'REFERRAL');

-- CreateEnum
CREATE TYPE "QueryPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SalesQueryStatus" AS ENUM ('NEW', 'ASSIGNED', 'UNDER_REVIEW', 'WAITING_FOR_CUSTOMER', 'QUOTATION_PREPARED', 'QUOTATION_SENT', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('QUERY_ASSIGNED', 'QUERY_STATUS_CHANGED', 'QUERY_COMMENT_ADDED', 'QUERY_MENTIONED');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_members" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInDept" "DepartmentMemberRole" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_queries" (
    "id" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "meetingType" "MeetingType" NOT NULL,
    "visitDate" TIMESTAMP(3),
    "visitLocation" TEXT,
    "requirement" TEXT NOT NULL,
    "priority" "QueryPriority" NOT NULL DEFAULT 'MEDIUM',
    "productInterest" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "status" "SalesQueryStatus" NOT NULL DEFAULT 'NEW',
    "closeReason" TEXT,
    "departmentId" TEXT,
    "regionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "convertedLeadId" TEXT,
    "convertedOpportunityId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_comments" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_attachments" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "commentId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "query_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_activities" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "SalesQueryStatus",
    "toStatus" "SalesQueryStatus",
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_regionId_idx" ON "departments"("regionId");

-- CreateIndex
CREATE INDEX "department_members_userId_idx" ON "department_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "department_members_departmentId_userId_key" ON "department_members"("departmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_queries_refNo_key" ON "sales_queries"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "sales_queries_convertedLeadId_key" ON "sales_queries"("convertedLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_queries_convertedOpportunityId_key" ON "sales_queries"("convertedOpportunityId");

-- CreateIndex
CREATE INDEX "sales_queries_regionId_idx" ON "sales_queries"("regionId");

-- CreateIndex
CREATE INDEX "sales_queries_departmentId_idx" ON "sales_queries"("departmentId");

-- CreateIndex
CREATE INDEX "sales_queries_ownerId_idx" ON "sales_queries"("ownerId");

-- CreateIndex
CREATE INDEX "sales_queries_status_idx" ON "sales_queries"("status");

-- CreateIndex
CREATE INDEX "query_comments_queryId_idx" ON "query_comments"("queryId");

-- CreateIndex
CREATE INDEX "query_comments_parentId_idx" ON "query_comments"("parentId");

-- CreateIndex
CREATE INDEX "query_attachments_queryId_idx" ON "query_attachments"("queryId");

-- CreateIndex
CREATE INDEX "query_attachments_commentId_idx" ON "query_attachments"("commentId");

-- CreateIndex
CREATE INDEX "query_activities_queryId_idx" ON "query_activities"("queryId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_entityType_entityId_idx" ON "notifications"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_convertedLeadId_fkey" FOREIGN KEY ("convertedLeadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_queries" ADD CONSTRAINT "sales_queries_convertedOpportunityId_fkey" FOREIGN KEY ("convertedOpportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_comments" ADD CONSTRAINT "query_comments_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "sales_queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_comments" ADD CONSTRAINT "query_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "query_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_attachments" ADD CONSTRAINT "query_attachments_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "sales_queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_attachments" ADD CONSTRAINT "query_attachments_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "query_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_activities" ADD CONSTRAINT "query_activities_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "sales_queries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
