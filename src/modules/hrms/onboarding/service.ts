import argon2 from 'argon2';
import { EmployeeLifecycleStatus, OnboardingTaskOwner, Role, UserStatus } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AuthUser } from '../../../core/middleware/types';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../core/errors/AppError';
import { generateId } from '../../../core/utils/idGenerator';
import { audit } from '../_shared/audit';
import { reportingTreeUserIds, resolveHrManageScope, scopeIncludes } from '../_shared/scope';
import { employeeInclude } from '../employees/repository';
import { employeeService } from '../employees/service';
import {
  AddOnboardingTaskInput,
  OnboardEmployeeInput,
  UpdateOnboardingTaskInput,
  UpsertTemplateInput,
} from './dto';

// Roles only a Super Admin may hand out — HR onboarding regular staff must
// not be a path to escalate privileges.
const PRIVILEGED_ROLES: Role[] = [Role.SUPER_ADMIN, Role.REGIONAL_ADMIN, Role.HR_ADMIN];

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const templateInclude = { tasks: { orderBy: { sortOrder: 'asc' as const } } };

function withProgress<T extends { doneAt: Date | null }>(tasks: T[]) {
  const done = tasks.filter((t) => t.doneAt).length;
  return { tasks, total: tasks.length, done };
}

export const onboardingService = {
  async onboard(actor: AuthUser, input: OnboardEmployeeInput) {
    const manageScope = await resolveHrManageScope(actor);
    if (!manageScope) throw new ForbiddenError('You cannot onboard employees');
    if (manageScope.kind === 'region' && manageScope.regionId !== input.regionId) {
      throw new ForbiddenError('You can only onboard employees into your own region');
    }
    if (PRIVILEGED_ROLES.includes(input.role) && manageScope.kind !== 'all') {
      throw new ForbiddenError('Only a Super Admin can assign this role');
    }

    const [region, existing, manager, designation, department, template] = await Promise.all([
      prisma.region.findUnique({ where: { id: input.regionId } }),
      prisma.user.findUnique({ where: { email: input.email } }),
      input.reportingToId ? prisma.user.findUnique({ where: { id: input.reportingToId } }) : null,
      input.designationId ? prisma.designation.findUnique({ where: { id: input.designationId } }) : null,
      input.departmentId ? prisma.department.findUnique({ where: { id: input.departmentId } }) : null,
      input.templateId ? prisma.onboardingTemplate.findUnique({ where: { id: input.templateId }, include: templateInclude }) : null,
    ]);
    if (!region) throw new BadRequestError('Branch (region) not found');
    if (existing) throw new ConflictError('A user with this email already exists');
    if (input.reportingToId && (!manager || manager.status !== UserStatus.ACTIVE)) {
      throw new BadRequestError('Reporting manager not found or inactive');
    }
    if (input.designationId && (!designation || !designation.active)) throw new BadRequestError('Designation not found');
    if (input.departmentId && (!department || department.deletedAt || !department.active)) {
      throw new BadRequestError('Department not found');
    }
    if (input.templateId && (!template || !template.active)) throw new BadRequestError('Onboarding template not found');
    if (input.probationEndsOn && input.probationEndsOn < input.joiningDate) {
      throw new BadRequestError('Probation cannot end before the joining date');
    }

    // generateId uses its own client, so it runs before the transaction.
    const userId = await generateId('USER');
    const passwordHash = await argon2.hash(input.password);
    const onProbation = input.lifecycleStatus === EmployeeLifecycleStatus.PROBATION || !!input.probationEndsOn;

    const employee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          regionId: input.regionId,
          reportingToId: input.reportingToId ?? null,
          employee: {
            create: {
              phone: input.phone ?? null,
              personalEmail: input.personalEmail ?? null,
              dateOfBirth: input.dateOfBirth ?? null,
              gender: input.gender ?? null,
              designationId: input.designationId ?? null,
              departmentId: input.departmentId ?? null,
              employmentType: input.employmentType,
              lifecycleStatus: input.lifecycleStatus,
              joiningDate: input.joiningDate,
              probationStartsOn: onProbation ? input.joiningDate : null,
              probationEndsOn: input.probationEndsOn ?? null,
              confirmedOn: input.lifecycleStatus === EmployeeLifecycleStatus.CONFIRMED ? input.joiningDate : null,
              noticePeriodDays: input.noticePeriodDays ?? null,
              workLocation: input.workLocation ?? null,
              onboardingTasks: template
                ? {
                    create: template.tasks.map((t) => ({
                      title: t.title,
                      description: t.description,
                      owner: t.owner,
                      dueDate: addDays(input.joiningDate, t.dueOffsetDays),
                      sortOrder: t.sortOrder,
                    })),
                  }
                : undefined,
            },
          },
        },
        include: { employee: true },
      });
      const employeeId = user.employee!.id;
      await tx.employeeLifecycleEvent.create({
        data: {
          employeeId,
          eventType: 'JOINED',
          fromValue: null,
          toValue: input.lifecycleStatus,
          effectiveDate: input.joiningDate,
          note: template ? `Onboarded with "${template.name}" checklist` : null,
          actorId: actor.id,
        },
      });
      await audit(tx, {
        entityType: 'Employee',
        entityId: employeeId,
        action: 'ONBOARD',
        actor,
        // Never log the password; record what was set up instead.
        to: { userId, role: input.role, regionId: input.regionId, templateId: input.templateId ?? null },
      });
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude });
    });

    return employee;
  },

  async listTasks(actor: AuthUser, idOrCode: string) {
    const employee = await employeeService.get(actor, idOrCode);
    const tasks = await prisma.onboardingTask.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return withProgress(tasks);
  },

  async addTask(actor: AuthUser, idOrCode: string, input: AddOnboardingTaskInput) {
    const employee = await employeeService.get(actor, idOrCode);
    const manageScope = await resolveHrManageScope(actor);
    if (!manageScope || !scopeIncludes(manageScope, { userId: employee.userId, regionId: employee.user.regionId })) {
      throw new ForbiddenError('Only HR can add onboarding tasks');
    }
    const last = await prisma.onboardingTask.aggregate({ where: { employeeId: employee.id }, _max: { sortOrder: true } });
    const task = await prisma.onboardingTask.create({
      data: { ...input, employeeId: employee.id, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await audit(prisma, { entityType: 'OnboardingTask', entityId: task.id, action: 'CREATE', actor, to: { title: task.title } });
    return task;
  },

  // HR can tick anything; the manager can tick MANAGER tasks for their team;
  // the employee can tick their own EMPLOYEE tasks.
  async updateTask(actor: AuthUser, idOrCode: string, taskId: string, input: UpdateOnboardingTaskInput) {
    const employee = await employeeService.get(actor, idOrCode);
    const task = await prisma.onboardingTask.findFirst({ where: { id: taskId, employeeId: employee.id } });
    if (!task) throw new NotFoundError('Onboarding task not found');

    const manageScope = await resolveHrManageScope(actor);
    const isHr = !!manageScope && scopeIncludes(manageScope, { userId: employee.userId, regionId: employee.user.regionId });
    const isSelf = employee.userId === actor.id;
    const isManager =
      !isSelf && task.owner === OnboardingTaskOwner.MANAGER && (await reportingTreeUserIds(actor.id)).includes(employee.userId);
    const allowed = isHr || isManager || (isSelf && task.owner === OnboardingTaskOwner.EMPLOYEE);
    if (!allowed) throw new ForbiddenError('You cannot update this task');

    const updated = await prisma.onboardingTask.update({
      where: { id: task.id },
      data: input.done ? { doneAt: task.doneAt ?? new Date(), doneById: task.doneById ?? actor.id } : { doneAt: null, doneById: null },
    });
    await audit(prisma, {
      entityType: 'OnboardingTask',
      entityId: task.id,
      action: input.done ? 'COMPLETE' : 'REOPEN',
      actor,
      remark: task.title,
    });
    return updated;
  },

  listTemplates() {
    return prisma.onboardingTemplate.findMany({ include: templateInclude, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
  },

  async createTemplate(actor: AuthUser, input: UpsertTemplateInput) {
    const clash = await prisma.onboardingTemplate.findUnique({ where: { name: input.name } });
    if (clash) throw new ConflictError('A template with this name already exists');
    const template = await prisma.onboardingTemplate.create({
      data: {
        name: input.name,
        active: input.active,
        tasks: { create: input.tasks.map((t, i) => ({ ...t, sortOrder: i + 1 })) },
      },
      include: templateInclude,
    });
    await audit(prisma, { entityType: 'OnboardingTemplate', entityId: template.id, action: 'CREATE', actor, to: { name: input.name, tasks: input.tasks.length } });
    return template;
  },

  // Replaces the task list. Checklists already copied onto employees are untouched.
  async updateTemplate(actor: AuthUser, id: string, input: UpsertTemplateInput) {
    const template = await prisma.onboardingTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundError('Template not found');
    if (input.name !== template.name) {
      const clash = await prisma.onboardingTemplate.findUnique({ where: { name: input.name } });
      if (clash) throw new ConflictError('A template with this name already exists');
    }
    return prisma.$transaction(async (tx) => {
      await tx.onboardingTemplateTask.deleteMany({ where: { templateId: id } });
      const updated = await tx.onboardingTemplate.update({
        where: { id },
        data: {
          name: input.name,
          active: input.active,
          tasks: { create: input.tasks.map((t, i) => ({ ...t, sortOrder: i + 1 })) },
        },
        include: templateInclude,
      });
      await audit(tx, { entityType: 'OnboardingTemplate', entityId: id, action: 'UPDATE', actor, to: { name: input.name, tasks: input.tasks.length } });
      return updated;
    });
  },
};
