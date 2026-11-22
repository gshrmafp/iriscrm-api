import { EmployeeLifecycleStatus, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AuthUser } from '../../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../core/errors/AppError';
import { PERMISSIONS } from '../../../config/permissions';
import { getEffectivePermissions } from '../../../core/rbac/effectivePermissions';
import { storage } from '../../../core/storage';
import { audit } from '../_shared/audit';
import { decryptField, encryptField, maskValue } from '../_shared/crypto';
import {
  employeeWhereForScope,
  reportingTreeUserIds,
  resolveHrManageScope,
  resolveHrScope,
  scopeIncludes,
} from '../_shared/scope';
import { todayInHrTimezone } from '../_shared/time';
import { EmployeeWithRelations, employeeInclude, employeeRepository } from './repository';
import {
  ListEmployeesQuery,
  UpdateEmployeeInput,
  UpdateMyEmployeeProfileInput,
  UploadDocumentInput,
  UpsertStatutoryInput,
} from './dto';

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Plain field → encrypted column on EmployeeStatutory.
const ENCRYPTED_FIELDS = {
  bankAccount: 'bankAccountEnc',
  pan: 'panEnc',
  aadhaar: 'aadhaarEnc',
  uan: 'uanEnc',
  pfNumber: 'pfNumberEnc',
  esiNumber: 'esiNumberEnc',
} as const;

function target(employee: EmployeeWithRelations) {
  return { userId: employee.userId, regionId: employee.user.regionId };
}

async function loadOrThrow(idOrCode: string) {
  const employee = await employeeRepository.findByIdOrCode(idOrCode);
  if (!employee) throw new NotFoundError('Employee not found');
  return employee;
}

async function loadVisibleOrThrow(actor: AuthUser, idOrCode: string) {
  const employee = await loadOrThrow(idOrCode);
  const scope = await resolveHrScope(actor);
  // 404 rather than 403 so the existence of out-of-scope records isn't leaked.
  if (!scopeIncludes(scope, target(employee))) throw new NotFoundError('Employee not found');
  return employee;
}

async function loadManageableOrThrow(actor: AuthUser, idOrCode: string) {
  const employee = await loadOrThrow(idOrCode);
  const manageScope = await resolveHrManageScope(actor);
  if (!manageScope || !scopeIncludes(manageScope, target(employee))) {
    throw new ForbiddenError('You cannot manage this employee');
  }
  return employee;
}

// Self, or HR with manage scope over the employee. Managers can see a team
// member's profile but not their documents or bank details.
async function assertOwnerOrManager(actor: AuthUser, employee: EmployeeWithRelations) {
  if (employee.userId === actor.id) return;
  const manageScope = await resolveHrManageScope(actor);
  if (!manageScope || !scopeIncludes(manageScope, target(employee))) {
    throw new ForbiddenError('You cannot access this employee\'s private records');
  }
}

export const employeeService = {
  async list(actor: AuthUser, filters: ListEmployeesQuery) {
    const scope = await resolveHrScope(actor);
    return employeeRepository.list(employeeWhereForScope(scope), filters);
  },

  async getMe(actor: AuthUser) {
    const employee = await employeeRepository.findByUserId(actor.id);
    if (!employee) throw new NotFoundError('No employee record for this account');
    return employee;
  },

  get(actor: AuthUser, idOrCode: string) {
    return loadVisibleOrThrow(actor, idOrCode);
  },

  async updateMe(actor: AuthUser, input: UpdateMyEmployeeProfileInput) {
    const employee = await this.getMe(actor);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id: employee.id }, data: input, include: employeeInclude });
      await audit(tx, { entityType: 'Employee', entityId: employee.id, action: 'SELF_UPDATE', actor, to: Object.keys(input) });
      return updated;
    });
  },

  async update(actor: AuthUser, idOrCode: string, input: UpdateEmployeeInput) {
    const employee = await loadManageableOrThrow(actor, idOrCode);
    const { reportingToId, regionId, effectiveDate, note, ...employeeData } = input;
    const isSelf = employee.userId === actor.id;

    if (isSelf && input.lifecycleStatus && input.lifecycleStatus !== employee.lifecycleStatus) {
      throw new ForbiddenError('You cannot change your own employment status');
    }

    if (reportingToId !== undefined && reportingToId !== employee.user.reportingTo?.id) {
      if (reportingToId === employee.userId) throw new BadRequestError('An employee cannot report to themselves');
      if (reportingToId) {
        const manager = await prisma.user.findUnique({ where: { id: reportingToId } });
        if (!manager) throw new BadRequestError('Reporting manager not found');
        const tree = await reportingTreeUserIds(employee.userId);
        if (tree.includes(reportingToId)) {
          throw new BadRequestError('That manager reports to this employee — it would create a reporting loop');
        }
      }
    }

    const transferring = regionId !== undefined && regionId !== employee.user.regionId;
    if (transferring) {
      const manageScope = await resolveHrManageScope(actor);
      if (manageScope?.kind !== 'all') throw new ForbiddenError('Only a Super Admin can transfer employees between branches');
      const region = await prisma.region.findUnique({ where: { id: regionId } });
      if (!region || !region.active) throw new BadRequestError('Branch (region) not found');
    }

    const when = effectiveDate ?? todayInHrTimezone();
    const events: Prisma.EmployeeLifecycleEventCreateManyInput[] = [];
    const track = (eventType: string, from: string | null | undefined, to: string | null | undefined) => {
      if (to === undefined || (from ?? null) === (to ?? null)) return;
      events.push({ employeeId: employee.id, eventType, fromValue: from ?? null, toValue: to ?? null, effectiveDate: when, note, actorId: actor.id });
    };
    track('STATUS_CHANGE', employee.lifecycleStatus, input.lifecycleStatus);
    track('DEPARTMENT_CHANGE', employee.departmentId, input.departmentId);
    track('DESIGNATION_CHANGE', employee.designationId, input.designationId);
    track('MANAGER_CHANGE', employee.user.reportingTo?.id ?? null, reportingToId);
    if (transferring) track('TRANSFER', employee.user.regionId, regionId);

    const exiting = input.lifecycleStatus === EmployeeLifecycleStatus.EXITED && employee.lifecycleStatus !== EmployeeLifecycleStatus.EXITED;
    const rejoining = input.lifecycleStatus && input.lifecycleStatus !== EmployeeLifecycleStatus.EXITED && employee.lifecycleStatus === EmployeeLifecycleStatus.EXITED;

    return prisma.$transaction(async (tx) => {
      const data: Prisma.EmployeeUncheckedUpdateInput = { ...employeeData };
      if (exiting && !input.exitDate) data.exitDate = when;
      if (rejoining) data.exitDate = null;
      await tx.employee.update({ where: { id: employee.id }, data });

      const userData: Prisma.UserUncheckedUpdateInput = {};
      if (reportingToId !== undefined) userData.reportingToId = reportingToId;
      if (transferring) userData.regionId = regionId;
      // Exiting revokes app access through the existing login block; rejoining restores it.
      if (exiting) userData.status = UserStatus.INACTIVE;
      if (rejoining) userData.status = UserStatus.ACTIVE;
      if (Object.keys(userData).length > 0) await tx.user.update({ where: { id: employee.userId }, data: userData });

      if (events.length > 0) await tx.employeeLifecycleEvent.createMany({ data: events });
      await audit(tx, { entityType: 'Employee', entityId: employee.id, action: 'UPDATE', actor, to: Object.keys(input) });
      return tx.employee.findUniqueOrThrow({ where: { id: employee.id }, include: employeeInclude });
    });
  },

  // Self sees their own values masked; HR with manage scope sees them masked
  // unless they also hold hr.employee.sensitive.view.
  async getStatutory(actor: AuthUser, idOrCode: string) {
    const employee = await loadOrThrow(idOrCode);
    await assertOwnerOrManager(actor, employee);
    const isSelf = employee.userId === actor.id;
    const permissions = await getEffectivePermissions(actor.id, actor.role);
    const reveal = !isSelf && permissions.has(PERMISSIONS.HR_EMPLOYEE_SENSITIVE_VIEW);

    const row = await employeeRepository.findStatutory(employee.id);
    const read = (enc: string | null | undefined) => {
      if (!enc) return null;
      const plain = decryptField(enc);
      return reveal ? plain : maskValue(plain);
    };
    return {
      employeeId: employee.id,
      masked: !reveal,
      bankName: row?.bankName ?? null,
      ifsc: row?.ifsc ?? null,
      bankAccount: read(row?.bankAccountEnc),
      pan: read(row?.panEnc),
      aadhaar: read(row?.aadhaarEnc),
      uan: read(row?.uanEnc),
      pfNumber: read(row?.pfNumberEnc),
      esiNumber: read(row?.esiNumberEnc),
      updatedAt: row?.updatedAt ?? null,
    };
  },

  async upsertStatutory(actor: AuthUser, idOrCode: string, input: UpsertStatutoryInput) {
    const employee = await loadManageableOrThrow(actor, idOrCode);
    const data: Record<string, string | null> = {};
    if (input.bankName !== undefined) data.bankName = input.bankName;
    if (input.ifsc !== undefined) data.ifsc = input.ifsc;
    for (const [field, column] of Object.entries(ENCRYPTED_FIELDS)) {
      const value = input[field as keyof typeof ENCRYPTED_FIELDS];
      if (value === undefined) continue;
      data[column] = value === null || value === '' ? null : encryptField(value);
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeStatutory.upsert({
        where: { employeeId: employee.id },
        create: { employeeId: employee.id, ...data, updatedById: actor.id },
        update: { ...data, updatedById: actor.id },
      });
      // Field names only — never the values.
      await audit(tx, { entityType: 'EmployeeStatutory', entityId: employee.id, action: 'UPDATE', actor, to: Object.keys(input) });
    });
    return this.getStatutory(actor, employee.id);
  },

  // Events store raw ids; resolve them to display names here so the client
  // doesn't need directory access to every department/region/person involved.
  async history(actor: AuthUser, idOrCode: string) {
    const employee = await loadVisibleOrThrow(actor, idOrCode);
    const events = await employeeRepository.listLifecycleEvents(employee.id);
    const idsFor = (type: string) =>
      [...new Set(events.filter((e) => e.eventType === type).flatMap((e) => [e.fromValue, e.toValue]).filter((v): v is string => !!v))];
    const userIds = [...new Set([...idsFor('MANAGER_CHANGE'), ...events.map((e) => e.actorId)])];
    const [departments, designations, regions, users] = await Promise.all([
      prisma.department.findMany({ where: { id: { in: idsFor('DEPARTMENT_CHANGE') } }, select: { id: true, name: true } }),
      prisma.designation.findMany({ where: { id: { in: idsFor('DESIGNATION_CHANGE') } }, select: { id: true, name: true } }),
      prisma.region.findMany({ where: { id: { in: idsFor('TRANSFER') } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    ]);
    const names = new Map<string, string>([...departments, ...designations, ...regions, ...users].map((r) => [r.id, r.name]));
    const label = (type: string, value: string | null) => {
      if (!value) return null;
      if (type === 'STATUS_CHANGE' || type === 'JOINED') return value;
      return names.get(value) ?? value;
    };
    return events.map((e) => ({
      ...e,
      fromLabel: label(e.eventType, e.fromValue),
      toLabel: label(e.eventType, e.toValue),
      actorName: names.get(e.actorId) ?? null,
    }));
  },

  async listDocuments(actor: AuthUser, idOrCode: string) {
    const employee = await loadOrThrow(idOrCode);
    await assertOwnerOrManager(actor, employee);
    return employeeRepository.listDocuments(employee.id);
  },

  async uploadDocument(actor: AuthUser, idOrCode: string, file: Express.Multer.File, input: UploadDocumentInput) {
    const employee = await loadOrThrow(idOrCode);
    await assertOwnerOrManager(actor, employee);
    if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
      throw new BadRequestError('Only PDF, JPG, PNG, WEBP and Word documents are allowed');
    }
    const stored = await storage.upload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      scope: `hr-documents/${employee.id}`,
    });
    return prisma.$transaction(async (tx) => {
      const document = await tx.hrDocument.create({
        data: {
          employeeId: employee.id,
          category: input.category,
          title: input.title,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          uploadedById: actor.id,
        },
      });
      await audit(tx, { entityType: 'HrDocument', entityId: document.id, action: 'CREATE', actor, remark: input.category });
      return document;
    });
  },

  async getDocumentFile(actor: AuthUser, idOrCode: string, documentId: string) {
    const employee = await loadOrThrow(idOrCode);
    await assertOwnerOrManager(actor, employee);
    const document = await employeeRepository.findDocument(employee.id, documentId);
    if (!document) throw new NotFoundError('Document not found');
    await audit(prisma, { entityType: 'HrDocument', entityId: document.id, action: 'DOWNLOAD', actor });
    return { document, filePath: storage.getFilePath(document.storageKey) };
  },

  async verifyDocument(actor: AuthUser, idOrCode: string, documentId: string) {
    const employee = await loadManageableOrThrow(actor, idOrCode);
    const document = await employeeRepository.findDocument(employee.id, documentId);
    if (!document) throw new NotFoundError('Document not found');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.hrDocument.update({ where: { id: document.id }, data: { verifiedById: actor.id, verifiedAt: new Date() } });
      await audit(tx, { entityType: 'HrDocument', entityId: document.id, action: 'VERIFY', actor });
      return updated;
    });
  },

  // Soft delete keeps the audit trail; the file itself stays on disk.
  async deleteDocument(actor: AuthUser, idOrCode: string, documentId: string) {
    const employee = await loadManageableOrThrow(actor, idOrCode);
    const document = await employeeRepository.findDocument(employee.id, documentId);
    if (!document) throw new NotFoundError('Document not found');
    await prisma.$transaction(async (tx) => {
      await tx.hrDocument.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
      await audit(tx, { entityType: 'HrDocument', entityId: document.id, action: 'DELETE', actor });
    });
  },
};
