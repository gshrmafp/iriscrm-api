-- HRMS Milestone 2: onboarding checklists.
-- NOTE: `prisma migrate diff` also proposes dropping legacy `leads` columns
-- (source, notes, address, customerId, productInterest…). Those are kept on
-- purpose to preserve production data and are excluded here.

-- CreateEnum
CREATE TYPE "OnboardingTaskOwner" AS ENUM ('HR', 'MANAGER', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "onboarding_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_tasks" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" "OnboardingTaskOwner" NOT NULL DEFAULT 'HR',
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner" "OnboardingTaskOwner" NOT NULL DEFAULT 'HR',
    "dueDate" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_templates_name_key" ON "onboarding_templates"("name");

-- CreateIndex
CREATE INDEX "onboarding_template_tasks_templateId_idx" ON "onboarding_template_tasks"("templateId");

-- CreateIndex
CREATE INDEX "onboarding_tasks_employeeId_idx" ON "onboarding_tasks"("employeeId");

-- AddForeignKey
ALTER TABLE "onboarding_template_tasks" ADD CONSTRAINT "onboarding_template_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "onboarding_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default checklist so HR can onboard immediately on every environment.
INSERT INTO "onboarding_templates" ("id", "name", "active", "createdAt", "updatedAt")
VALUES ('onbtpl_default', 'Standard onboarding', true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "onboarding_template_tasks" ("id", "templateId", "title", "description", "owner", "dueOffsetDays", "sortOrder")
SELECT v.id, 'onbtpl_default', v.title, v.description, v.owner::"OnboardingTaskOwner", v.offset_days, v.sort_order
FROM (VALUES
  ('onbtpt_01', 'Send offer & appointment letter', 'Upload the signed copies to Documents.', 'HR', -3, 1),
  ('onbtpt_02', 'Collect ID & address proof', 'PAN, Aadhaar and address proof in Documents.', 'HR', 0, 2),
  ('onbtpt_03', 'Record bank & statutory details', 'Bank account, IFSC, PAN, UAN under Bank & statutory.', 'HR', 0, 3),
  ('onbtpt_04', 'Complete personal & emergency contact details', 'Update My Profile in IRIS.', 'EMPLOYEE', 1, 4),
  ('onbtpt_05', 'Set up laptop, email & IRIS access', NULL, 'HR', 0, 5),
  ('onbtpt_06', 'Team introduction & first-week plan', NULL, 'MANAGER', 1, 6),
  ('onbtpt_07', 'Policy walkthrough (leave, attendance, conduct)', NULL, 'HR', 3, 7),
  ('onbtpt_08', '30-day check-in', NULL, 'MANAGER', 30, 8)
) AS v(id, title, description, owner, offset_days, sort_order)
WHERE EXISTS (SELECT 1 FROM "onboarding_templates" WHERE "id" = 'onbtpl_default')
ON CONFLICT ("id") DO NOTHING;
