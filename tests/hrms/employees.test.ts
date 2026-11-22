import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { storage } from '../../src/core/storage';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';

const app = createApp();

async function login(email: string, password = 'TestPass123!') {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data?.accessToken as string;
}

describe('HRMS employees', () => {
  let regionA: string;
  let regionB: string;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let designationId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    regionA = (await createTestRegion('HRA')).id;
    regionB = (await createTestRegion('HRB')).id;

    const make = async (key: string, role: Role, regionId: string, reportingToId?: string) => {
      const { user } = await createTestUser(role, regionId, `hr-${key}`);
      if (reportingToId) await prisma.user.update({ where: { id: user.id }, data: { reportingToId } });
      ids[key] = user.id;
      tokens[key] = await login(user.email);
    };
    await make('superAdmin', Role.SUPER_ADMIN, regionA);
    await make('hrAdmin', Role.HR_ADMIN, regionA);
    await make('manager', Role.SALES_MANAGER, regionA);
    await make('exec', Role.SALES_EXECUTIVE, regionA, ids.manager);
    await make('peer', Role.SALES_EXECUTIVE, regionA);
    await make('execB', Role.SALES_EXECUTIVE, regionB);

    designationId = (await prisma.designation.create({ data: { code: `T${Date.now().toString(36)}`.toUpperCase(), name: 'Test Designation' } })).id;
  });

  afterAll(async () => {
    const userIds = Object.values(ids);
    const documents = await prisma.hrDocument.findMany({ where: { employee: { userId: { in: userIds } } } });
    for (const document of documents) await storage.delete(document.storageKey);
    await prisma.activityLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { reportingToId: null } });
    await prisma.user.deleteMany({ where: { regionId: { in: [regionA, regionB] } } });
    await prisma.designation.delete({ where: { id: designationId } });
    await prisma.region.deleteMany({ where: { id: { in: [regionA, regionB] } } });
    await prisma.$disconnect();
  });

  const get = (who: string, url: string) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`);
  const send = (who: string, method: 'patch' | 'put' | 'post', url: string, body: object) =>
    request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${tokens[who]}`).send(body);
  const codesIn = (res: request.Response) => (res.body.data.items as { userId: string }[]).map((e) => e.userId);

  describe('directory scope', () => {
    it('a plain employee sees only themselves', async () => {
      const res = await get('peer', '/hrms/employees?pageSize=200');
      expect(res.status).toBe(200);
      expect(codesIn(res)).toEqual([ids.peer]);
    });

    it('a manager sees themselves and their reports, not peers', async () => {
      const res = await get('manager', '/hrms/employees?pageSize=200');
      expect(codesIn(res).sort()).toEqual([ids.manager, ids.exec].sort());
    });

    it('HR admin sees their whole region and nothing outside it', async () => {
      const res = await get('hrAdmin', '/hrms/employees?pageSize=200');
      const codes = codesIn(res);
      for (const key of ['hrAdmin', 'manager', 'exec', 'peer']) expect(codes).toContain(ids[key]);
      expect(codes).not.toContain(ids.execB);
    });

    it('out-of-scope records read as not found', async () => {
      expect((await get('peer', `/hrms/employees/${ids.exec}`)).status).toBe(404);
      expect((await get('hrAdmin', `/hrms/employees/${ids.execB}`)).status).toBe(404);
      expect((await get('superAdmin', `/hrms/employees/${ids.execB}`)).status).toBe(200);
    });

    it('resolves an employee by employee code', async () => {
      const res = await get('manager', `/hrms/employees/${ids.exec}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe(ids.exec);
      expect(res.body.data.user.reportingTo.id).toBe(ids.manager);
    });
  });

  describe('HR edits', () => {
    it('managers cannot edit their team members', async () => {
      const res = await send('manager', 'patch', `/hrms/employees/${ids.exec}`, { workLocation: 'Gurugram' });
      expect(res.status).toBe(403);
    });

    it('records department/designation/status changes in history', async () => {
      const res = await send('hrAdmin', 'patch', `/hrms/employees/${ids.exec}`, {
        designationId,
        lifecycleStatus: 'PROBATION',
        joiningDate: '2026-11-01',
        note: 'Moved to probation review',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.designation.id).toBe(designationId);

      const history = await get('hrAdmin', `/hrms/employees/${ids.exec}/history`);
      const types = (history.body.data as { eventType: string }[]).map((e) => e.eventType);
      expect(types).toEqual(expect.arrayContaining(['DESIGNATION_CHANGE', 'STATUS_CHANGE']));
    });

    it('rejects a manager change that would create a reporting loop', async () => {
      const res = await send('hrAdmin', 'patch', `/hrms/employees/${ids.manager}`, { reportingToId: ids.exec });
      expect(res.status).toBe(400);
    });

    it('HR cannot change their own employment status', async () => {
      const res = await send('hrAdmin', 'patch', `/hrms/employees/${ids.hrAdmin}`, { lifecycleStatus: 'NOTICE' });
      expect(res.status).toBe(403);
    });
  });

  describe('bank & statutory data', () => {
    it('stores identifiers encrypted and shows them unmasked only to HR with sensitive access', async () => {
      const put = await send('hrAdmin', 'put', `/hrms/employees/${ids.exec}/statutory`, {
        bankName: 'HDFC',
        bankAccount: '123456789012',
        ifsc: 'hdfc0001234',
        pan: 'abcde1234f',
      });
      expect(put.status).toBe(200);
      expect(put.body.data.pan).toBe('ABCDE1234F');
      expect(put.body.data.ifsc).toBe('HDFC0001234');

      const employee = await prisma.employee.findUniqueOrThrow({ where: { userId: ids.exec } });
      const row = await prisma.employeeStatutory.findUniqueOrThrow({ where: { employeeId: employee.id } });
      expect(row.panEnc).not.toContain('ABCDE1234F');
      expect(row.bankAccountEnc).toMatch(/^v1:/);

      const self = await get('exec', `/hrms/employees/${ids.exec}/statutory`);
      expect(self.status).toBe(200);
      expect(self.body.data.masked).toBe(true);
      expect(self.body.data.bankAccount).toBe('XXXXXXXX9012');
      expect(self.body.data.pan).toBe('XXXXXX234F');
    });

    it('blocks managers from team members\' bank details', async () => {
      expect((await get('manager', `/hrms/employees/${ids.exec}/statutory`)).status).toBe(403);
    });

    it('validates PAN format', async () => {
      const res = await send('hrAdmin', 'put', `/hrms/employees/${ids.exec}/statutory`, { pan: 'NOTAPAN' });
      expect(res.status).toBe(422);
    });
  });

  describe('self service', () => {
    it('employees update their own contact details', async () => {
      const ok = await send('peer', 'patch', '/hrms/employees/me', { phone: '9876543210', emergencyContactName: 'Asha' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.phone).toBe('9876543210');
      const bad = await send('peer', 'patch', '/hrms/employees/me', { phone: '12345' });
      expect(bad.status).toBe(422);
    });

    it('employees upload their own documents; managers cannot see them; HR verifies', async () => {
      const upload = await request(app)
        .post(`/api/v1/hrms/employees/${ids.exec}/documents`)
        .set('Authorization', `Bearer ${tokens.exec}`)
        .field('category', 'ID_PROOF')
        .field('title', 'PAN card')
        .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'pan.pdf', contentType: 'application/pdf' });
      expect(upload.status).toBe(201);
      const documentId = upload.body.data.id;

      expect((await get('manager', `/hrms/employees/${ids.exec}/documents`)).status).toBe(403);

      const verify = await send('hrAdmin', 'post', `/hrms/employees/${ids.exec}/documents/${documentId}/verify`, {});
      expect(verify.status).toBe(200);
      expect(verify.body.data.verifiedAt).toBeTruthy();

      const download = await get('exec', `/hrms/employees/${ids.exec}/documents/${documentId}`);
      expect(download.status).toBe(200);
    });

    it('rejects disallowed file types', async () => {
      const res = await request(app)
        .post(`/api/v1/hrms/employees/${ids.peer}/documents`)
        .set('Authorization', `Bearer ${tokens.peer}`)
        .field('category', 'OTHER')
        .field('title', 'script')
        .attach('file', Buffer.from('echo hi'), { filename: 'x.sh', contentType: 'application/x-sh' });
      expect(res.status).toBe(400);
    });
  });

  describe('lifecycle', () => {
    it('exiting an employee deactivates their login', async () => {
      const res = await send('hrAdmin', 'patch', `/hrms/employees/${ids.peer}`, { lifecycleStatus: 'EXITED' });
      expect(res.status).toBe(200);
      expect(res.body.data.exitDate).toBeTruthy();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.peer } });
      expect(user.status).toBe('INACTIVE');
      expect((await get('peer', '/hrms/employees/me')).status).toBe(401);
    });

    it('exited employees are hidden from the directory unless requested', async () => {
      const visible = codesIn(await get('hrAdmin', '/hrms/employees?pageSize=200'));
      expect(visible).not.toContain(ids.peer);
      const withExited = codesIn(await get('hrAdmin', '/hrms/employees?pageSize=200&includeExited=true'));
      expect(withExited).toContain(ids.peer);
    });

    it('users created through the admin API get an employee record', async () => {
      const res = await send('superAdmin', 'post', '/users', {
        name: 'New Joiner',
        email: `joiner-${Date.now()}@test.local`,
        password: 'Password123!',
        role: 'SALES_EXECUTIVE',
        regionId: regionA,
      });
      expect(res.status).toBe(201);
      ids.joiner = res.body.data.id;
      const employee = await prisma.employee.findUnique({ where: { userId: res.body.data.id } });
      expect(employee).not.toBeNull();
    });
  });
});
