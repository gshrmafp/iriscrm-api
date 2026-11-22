import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';

const app = createApp();

async function login(email: string, password = 'TestPass123!') {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data?.accessToken as string;
}

describe('HRMS onboarding, org chart and transfers', () => {
  let regionA: string;
  let regionB: string;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const templateIds: string[] = [];
  const stamp = Date.now().toString(36);

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    regionA = (await createTestRegion('OBA')).id;
    regionB = (await createTestRegion('OBB')).id;
    const make = async (key: string, role: Role, regionId: string, reportingToId?: string) => {
      const { user } = await createTestUser(role, regionId, `ob-${key}`);
      if (reportingToId) await prisma.user.update({ where: { id: user.id }, data: { reportingToId } });
      ids[key] = user.id;
      tokens[key] = await login(user.email);
    };
    await make('superAdmin', Role.SUPER_ADMIN, regionA);
    await make('hrAdmin', Role.HR_ADMIN, regionA);
    await make('manager', Role.SALES_MANAGER, regionA);
    await make('exec', Role.SALES_EXECUTIVE, regionA, ids.manager);
    await make('execB', Role.SALES_EXECUTIVE, regionB);
  });

  afterAll(async () => {
    const regionUsers = await prisma.user.findMany({ where: { regionId: { in: [regionA, regionB] } }, select: { id: true } });
    const userIds = regionUsers.map((u) => u.id);
    await prisma.activityLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { reportingToId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.onboardingTemplate.deleteMany({ where: { id: { in: templateIds } } });
    await prisma.department.deleteMany({ where: { regionId: { in: [regionA, regionB] } } });
    await prisma.region.deleteMany({ where: { id: { in: [regionA, regionB] } } });
    await prisma.$disconnect();
  });

  const get = (who: string, url: string) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);
  const send = (who: string, method: 'patch' | 'put' | 'post', url: string, body: object) =>
    request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`).send(body);

  const joiner = (overrides: Record<string, unknown> = {}) => ({
    name: 'New Joiner',
    email: `joiner-${stamp}-${Math.random().toString(36).slice(2, 7)}@test.local`,
    password: 'Welcome123!',
    role: Role.SALES_EXECUTIVE,
    regionId: regionA,
    joiningDate: '2026-12-01',
    ...overrides,
  });

  describe('onboarding', () => {
    let templateId: string;
    let newUserId: string;
    let newEmail: string;

    beforeAll(async () => {
      const res = await send('hrAdmin', 'post', '/hrms/onboarding/templates', {
        name: `Test checklist ${stamp}`,
        tasks: [
          { title: 'Collect documents', owner: 'HR', dueOffsetDays: -2 },
          { title: 'Team intro', owner: 'MANAGER', dueOffsetDays: 1 },
          { title: 'Fill profile', owner: 'EMPLOYEE', dueOffsetDays: 0 },
        ],
      });
      expect(res.status).toBe(201);
      templateId = res.body.data.id;
      templateIds.push(templateId);
    });

    it('creates login, employee record and checklist together', async () => {
      const body = joiner({ reportingToId: ids.manager, templateId, lifecycleStatus: 'PROBATION', probationEndsOn: '2027-05-31' });
      newEmail = body.email;
      const res = await send('hrAdmin', 'post', '/hrms/onboarding', body);
      expect(res.status).toBe(201);
      newUserId = res.body.data.userId;
      expect(res.body.data.lifecycleStatus).toBe('PROBATION');
      expect(res.body.data.probationStartsOn).toContain('2026-12-01');
      expect(res.body.data.user.reportingTo.id).toBe(ids.manager);

      // The new person can sign in with the temporary password.
      const newToken = await login(newEmail, 'Welcome123!');
      expect(newToken).toBeTruthy();
      tokens.joiner = newToken;

      const checklist = await get('hrAdmin', `/hrms/employees/${newUserId}/onboarding`);
      expect(checklist.body.data.total).toBe(3);
      expect(checklist.body.data.done).toBe(0);
      const [docs] = checklist.body.data.tasks;
      expect(docs.dueDate).toContain('2026-11-29'); // joining − 2 days

      const history = await get('hrAdmin', `/hrms/employees/${newUserId}/history`);
      expect(history.body.data.map((e: { eventType: string }) => e.eventType)).toContain('JOINED');
    });

    it('rejects a duplicate email', async () => {
      const res = await send('hrAdmin', 'post', '/hrms/onboarding', joiner({ email: newEmail }));
      expect(res.status).toBe(409);
    });

    it('region HR cannot onboard into another region or hand out privileged roles', async () => {
      expect((await send('hrAdmin', 'post', '/hrms/onboarding', joiner({ regionId: regionB }))).status).toBe(403);
      expect((await send('hrAdmin', 'post', '/hrms/onboarding', joiner({ role: Role.HR_ADMIN }))).status).toBe(403);
      expect((await send('superAdmin', 'post', '/hrms/onboarding', joiner({ role: Role.HR_ADMIN, regionId: regionB }))).status).toBe(201);
    });

    it('managers and employees cannot onboard', async () => {
      expect((await send('manager', 'post', '/hrms/onboarding', joiner())).status).toBe(403);
      expect((await send('exec', 'post', '/hrms/onboarding', joiner())).status).toBe(403);
    });

    it('only the right people can tick each task', async () => {
      const { tasks } = (await get('hrAdmin', `/hrms/employees/${newUserId}/onboarding`)).body.data;
      const byOwner = (owner: string) => tasks.find((t: { owner: string }) => t.owner === owner).id;
      const tick = (who: string, taskId: string, done = true) =>
        send(who, 'patch', `/hrms/employees/${newUserId}/onboarding/${taskId}`, { done });

      expect((await tick('joiner', byOwner('HR'))).status).toBe(403);
      expect((await tick('joiner', byOwner('EMPLOYEE'))).status).toBe(200);
      expect((await tick('manager', byOwner('HR'))).status).toBe(403);
      expect((await tick('manager', byOwner('MANAGER'))).status).toBe(200);
      expect((await tick('hrAdmin', byOwner('HR'))).status).toBe(200);
      expect((await tick('exec', byOwner('MANAGER'))).status).toBe(404); // not in exec's scope

      const after = (await get('hrAdmin', `/hrms/employees/${newUserId}/onboarding`)).body.data;
      expect(after.done).toBe(3);

      const reopened = await tick('hrAdmin', byOwner('HR'), false);
      expect(reopened.body.data.doneAt).toBeNull();
    });

    it('editing a template does not change checklists already given out', async () => {
      const res = await send('hrAdmin', 'put', `/hrms/onboarding/templates/${templateId}`, {
        name: `Test checklist ${stamp}`,
        tasks: [{ title: 'Only task' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.tasks).toHaveLength(1);
      expect((await get('hrAdmin', `/hrms/employees/${newUserId}/onboarding`)).body.data.total).toBe(3);
    });
  });

  describe('org chart', () => {
    it('is scoped like the directory', async () => {
      const managerView = await get('manager', '/hrms/org-chart');
      expect(managerView.status).toBe(200);
      const managerIds = managerView.body.data.map((n: { userId: string }) => n.userId);
      expect(managerIds).toContain(ids.exec);
      expect(managerIds).not.toContain(ids.execB);
      const execNode = managerView.body.data.find((n: { userId: string }) => n.userId === ids.exec);
      expect(execNode.reportingToId).toBe(ids.manager);

      const hrView = (await get('hrAdmin', '/hrms/org-chart')).body.data.map((n: { userId: string }) => n.userId);
      expect(hrView).not.toContain(ids.execB);
    });
  });

  describe('HR departments list', () => {
    it('is readable by HR admins, who lack the Sales-side department permission', async () => {
      expect((await get('hrAdmin', '/departments')).status).toBe(403);
      const res = await get('hrAdmin', '/hrms/departments?includeInactive=true');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) expect(typeof res.body.data[0].headcount).toBe('number');
    });

    it('HR can create a department in their region; a duplicate code is a clear 409', async () => {
      const code = `D${stamp}`.toUpperCase().slice(0, 12);
      const created = await send('hrAdmin', 'post', '/departments', { code, name: 'Test Ops' });
      expect(created.status).toBe(201);
      expect(created.body.data.regionId).toBe(regionA);
      expect((await send('hrAdmin', 'post', '/departments', { code, name: 'Again' })).status).toBe(409);
      const listed = (await get('hrAdmin', '/hrms/departments')).body.data.find((d: { code: string }) => d.code === code);
      expect(listed.headcount).toBe(0);
    });
  });

  describe('branch transfer', () => {
    it('only a Super Admin can move someone between branches, and it is recorded', async () => {
      expect((await send('hrAdmin', 'patch', `/hrms/employees/${ids.exec}`, { regionId: regionB })).status).toBe(403);

      const res = await send('superAdmin', 'patch', `/hrms/employees/${ids.exec}`, { regionId: regionB, note: 'Moved to branch B' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.regionId).toBe(regionB);

      const history = await get('superAdmin', `/hrms/employees/${ids.exec}/history`);
      const transfer = history.body.data.find((e: { eventType: string }) => e.eventType === 'TRANSFER');
      expect(transfer).toMatchObject({ fromValue: regionA, toValue: regionB });
      expect(transfer.toLabel).not.toBe(regionB); // resolved to the branch name
      expect(transfer.actorName).toBeTruthy();

      // Region-A HR no longer sees them.
      expect((await get('hrAdmin', `/hrms/employees/${ids.exec}`)).status).toBe(404);
    });
  });
});
