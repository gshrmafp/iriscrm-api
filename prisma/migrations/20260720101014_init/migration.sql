-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'REGIONAL_ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('GRANT', 'DENY');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'WEB_FORM', 'PHONE_IN', 'REFERRAL', 'EXISTING_CUSTOMER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'LOST');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('INSTALLATION', 'AMC', 'PRODUCT');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "PriceRuleType" AS ENUM ('REGION_OVERRIDE', 'VOLUME_SLAB', 'CUSTOMER_TIER', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AmcType" AS ENUM ('COMPREHENSIVE', 'NON_COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "AmcFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "AmcStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PENDING', 'HANDED_OFF');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "regionId" TEXT NOT NULL,
    "reportingToId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contacts" JSONB,
    "addresses" JSONB,
    "regionId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "source" "LeadSource" NOT NULL,
    "productInterest" TEXT,
    "notes" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "lostReason" TEXT,
    "regionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_follow_ups" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "nextActionAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "dealType" "DealType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expectedClose" TIMESTAMP(3),
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "regionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" "OpportunityStage",
    "toStage" "OpportunityStage" NOT NULL,
    "remark" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "basePrice" DECIMAL(14,2) NOT NULL,
    "taxClass" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "regionId" TEXT,
    "ruleType" "PriceRuleType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "validTill" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "regionId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amc_contracts" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT,
    "type" "AmcType" NOT NULL,
    "frequency" "AmcFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "status" "AmcStatus" NOT NULL DEFAULT 'DRAFT',
    "regionId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amc_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "customerId" TEXT,
    "site" TEXT,
    "bom" JSONB,
    "timeline" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING',
    "regionId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_regionId_idx" ON "users"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permissionKey_key" ON "role_permissions"("role", "permissionKey");

-- CreateIndex
CREATE INDEX "user_permission_overrides_userId_idx" ON "user_permission_overrides"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_userId_permissionKey_key" ON "user_permission_overrides"("userId", "permissionKey");

-- CreateIndex
CREATE INDEX "customers_regionId_idx" ON "customers"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_refNo_key" ON "leads"("refNo");

-- CreateIndex
CREATE INDEX "leads_regionId_idx" ON "leads"("regionId");

-- CreateIndex
CREATE INDEX "leads_contactPhone_idx" ON "leads"("contactPhone");

-- CreateIndex
CREATE INDEX "leads_contactEmail_idx" ON "leads"("contactEmail");

-- CreateIndex
CREATE INDEX "lead_follow_ups_leadId_idx" ON "lead_follow_ups"("leadId");

-- CreateIndex
CREATE INDEX "lead_follow_ups_nextActionAt_idx" ON "lead_follow_ups"("nextActionAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_leadId_key" ON "opportunities"("leadId");

-- CreateIndex
CREATE INDEX "opportunities_regionId_idx" ON "opportunities"("regionId");

-- CreateIndex
CREATE INDEX "opportunities_ownerId_idx" ON "opportunities"("ownerId");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_opportunityId_idx" ON "opportunity_stage_history"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_code_key" ON "catalog_items"("code");

-- CreateIndex
CREATE INDEX "price_rules_catalogItemId_idx" ON "price_rules"("catalogItemId");

-- CreateIndex
CREATE INDEX "quotations_opportunityId_idx" ON "quotations"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_opportunityId_version_key" ON "quotations"("opportunityId", "version");

-- CreateIndex
CREATE INDEX "quotation_lines_quotationId_idx" ON "quotation_lines"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "amc_contracts_opportunityId_key" ON "amc_contracts"("opportunityId");

-- CreateIndex
CREATE INDEX "amc_contracts_regionId_idx" ON "amc_contracts"("regionId");

-- CreateIndex
CREATE INDEX "amc_contracts_endDate_idx" ON "amc_contracts"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "projects_opportunityId_key" ON "projects"("opportunityId");

-- CreateIndex
CREATE INDEX "projects_regionId_idx" ON "projects"("regionId");

-- CreateIndex
CREATE INDEX "activity_log_entityType_entityId_idx" ON "activity_log"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reportingToId_fkey" FOREIGN KEY ("reportingToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amc_contracts" ADD CONSTRAINT "amc_contracts_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
