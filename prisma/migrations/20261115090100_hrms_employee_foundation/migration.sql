-- HRMS Phase 1: employee foundation.
-- NOTE: prisma migrate diff also proposes dropping the legacy leads.source/notes/address/... columns.
-- They are intentionally kept (historical production data, see 20260926090000), so those statements are omitted.

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "EmployeeLifecycleStatus" AS ENUM ('ONBOARDING', 'PROBATION', 'CONFIRMED', 'NOTICE', 'EXITED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "HrDocumentCategory" AS ENUM ('RESUME', 'OFFER_LETTER', 'APPOINTMENT_LETTER', 'ID_PROOF', 'ADDRESS_PROOF', 'EDUCATION', 'EXPERIENCE', 'POLICY', 'OTHER');

-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "personalEmail" TEXT,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "currentAddress" TEXT,
    "permanentAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRel" TEXT,
    "photoStorageKey" TEXT,
    "designationId" TEXT,
    "departmentId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "lifecycleStatus" "EmployeeLifecycleStatus" NOT NULL DEFAULT 'CONFIRMED',
    "joiningDate" DATE,
    "probationStartsOn" DATE,
    "probationEndsOn" DATE,
    "confirmedOn" DATE,
    "noticePeriodDays" INTEGER,
    "exitDate" DATE,
    "workLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_statutory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bankName" TEXT,
    "bankAccountEnc" TEXT,
    "ifsc" TEXT,
    "panEnc" TEXT,
    "aadhaarEnc" TEXT,
    "uanEnc" TEXT,
    "pfNumberEnc" TEXT,
    "esiNumberEnc" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_statutory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_lifecycle_events" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "HrDocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "hr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");

-- CreateIndex
CREATE INDEX "employees_designationId_idx" ON "employees"("designationId");

-- CreateIndex
CREATE INDEX "employees_lifecycleStatus_idx" ON "employees"("lifecycleStatus");

-- CreateIndex
CREATE UNIQUE INDEX "employee_statutory_employeeId_key" ON "employee_statutory"("employeeId");

-- CreateIndex
CREATE INDEX "employee_lifecycle_events_employeeId_createdAt_idx" ON "employee_lifecycle_events"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "hr_documents_employeeId_idx" ON "hr_documents"("employeeId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_statutory" ADD CONSTRAINT "employee_statutory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_events" ADD CONSTRAINT "employee_lifecycle_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: exactly one Employee per existing User (Employee code = User.id).
-- Joining date defaults to the account creation date; HR corrects it later.
INSERT INTO "employees" ("id", "userId", "employmentType", "lifecycleStatus", "joiningDate", "createdAt", "updatedAt")
SELECT md5(random()::text || u."id"), u."id", 'FULL_TIME', 'CONFIRMED', u."createdAt"::date, NOW(), NOW()
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "employees" e WHERE e."userId" = u."id");

-- Role permissions for the new HR keys. Existing deployments are not re-seeded,
-- so the rows have to be created here (mirrors ROLE_DEFAULT_PERMISSIONS).
INSERT INTO "role_permissions" ("id", "role", "permissionKey") VALUES
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.dashboard.view'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.employee.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.employee.sensitive.view'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.org.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.attendance.team'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.attendance.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.shift.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.leave.approve'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.leave.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.holiday.manage'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'SUPER_ADMIN', 'hr.settings.manage'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.attendance.team'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.leave.approve'),
  (md5(random()::text || clock_timestamp()::text), 'REGIONAL_ADMIN', 'hr.dashboard.view'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.attendance.team'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_MANAGER', 'hr.leave.approve'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_EXECUTIVE', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_EXECUTIVE', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_EXECUTIVE', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'SALES_EXECUTIVE', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'AUDITOR', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'AUDITOR', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'AUDITOR', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'AUDITOR', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.dashboard.view'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.employee.view'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.employee.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.employee.sensitive.view'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.org.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.attendance.self'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.attendance.team'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.attendance.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.shift.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.leave.apply'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.leave.approve'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.leave.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.holiday.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.approval.act'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'hr.settings.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'department.manage'),
  (md5(random()::text || clock_timestamp()::text), 'HR_ADMIN', 'notification.view')
ON CONFLICT ("role", "permissionKey") DO NOTHING;
