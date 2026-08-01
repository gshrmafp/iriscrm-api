import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken as string;
}

describe('Picklists (admin-managed Lead Source / Product Interest options)', () => {
  let regionId: string;
  let adminToken: string;
  let execToken: string;
  const testCode = `CURL_TEST_${Date.now()}`;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('PICK');
    regionId = region.id;

    const { user: admin, password: adminPw } = await createTestUser(Role.REGIONAL_ADMIN, regionId, 'pick-admin');
    const { user: exec, password: execPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'pick-exec');
    adminToken = await login(admin.email, adminPw);
    execToken = await login(exec.email, execPw);
  });

  afterAll(async () => {
    await prisma.picklistOption.deleteMany({ where: { code: testCode } });
    await prisma.lead.deleteMany({ where: { regionId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('lists active LEAD_SOURCE options for any authenticated user', async () => {
    const res = await request(app).get('/api/v1/picklists?listType=LEAD_SOURCE').set('Authorization', `Bearer ${execToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((o: { code: string }) => o.code === 'MANUAL')).toBe(true);
  });

  it('rejects a non-admin creating a picklist option', async () => {
    const res = await request(app)
      .post('/api/v1/picklists')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ listType: 'LEAD_SOURCE', code: testCode, label: 'Curl Test' });
    expect(res.status).toBe(403);
  });

  it('lets an admin create, then deactivate, a picklist option', async () => {
    const createRes = await request(app)
      .post('/api/v1/picklists')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ listType: 'LEAD_SOURCE', code: testCode, label: 'Curl Test' });
    expect(createRes.status).toBe(201);
    const optionId = createRes.body.data.id;

    const activeList = await request(app).get('/api/v1/picklists?listType=LEAD_SOURCE').set('Authorization', `Bearer ${execToken}`);
    expect(activeList.body.data.some((o: { code: string }) => o.code === testCode)).toBe(true);

    const deactivateRes = await request(app)
      .patch(`/api/v1/picklists/${optionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.active).toBe(false);

    const afterDeactivate = await request(app).get('/api/v1/picklists?listType=LEAD_SOURCE').set('Authorization', `Bearer ${execToken}`);
    expect(afterDeactivate.body.data.some((o: { code: string }) => o.code === testCode)).toBe(false);

    const allList = await request(app)
      .get('/api/v1/picklists/all?listType=LEAD_SOURCE')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(allList.body.data.some((o: { code: string }) => o.code === testCode)).toBe(true);
  });

  it('rejects creating a lead with a source code that is not a valid active option', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Bad Source Customer', source: 'NOT_A_REAL_SOURCE' });
    expect(res.status).toBe(400);
  });

  it('rejects creating a lead with an invalid productInterest code', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Bad Product Customer', source: 'MANUAL', productInterest: 'NOT_A_REAL_PRODUCT' });
    expect(res.status).toBe(400);
  });

  it('creates a lead successfully with valid source and productInterest codes', async () => {
    const res = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Good Customer', source: 'WEB_FORM', productInterest: 'CCTV_INSTALLATION' });
    expect(res.status).toBe(201);
    expect(res.body.data.lead.source).toBe('WEB_FORM');
    expect(res.body.data.lead.productInterest).toBe('CCTV_INSTALLATION');
  });
});
