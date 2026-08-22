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

describe('Customers module — create, list, region isolation', () => {
  let regionAId: string;
  let regionBId: string;
  let execAToken: string;
  let execBToken: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();

    const regionA = await createTestRegion('CA');
    const regionB = await createTestRegion('CB');
    regionAId = regionA.id;
    regionBId = regionB.id;

    const { user: execA, password: pwA } = await createTestUser(Role.SALES_EXECUTIVE, regionAId, 'cust-exec-a');
    const { user: execB, password: pwB } = await createTestUser(Role.SALES_EXECUTIVE, regionBId, 'cust-exec-b');
    execAToken = await login(execA.email, pwA);
    execBToken = await login(execB.email, pwB);
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.user.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.region.deleteMany({ where: { id: { in: [regionAId, regionBId] } } });
    await prisma.$disconnect();
  });

  it('creates a customer scoped to the creator region and returns it in that region only', async () => {
    const createRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({
        name: 'Acme Corp',
        type: 'Business',
        contacts: [{ name: 'Jane Doe', phone: '9999999999', email: 'jane@acme.com' }],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.regionId).toBe(regionAId);
    const customerId = createRes.body.data.id;

    const listResA = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${execAToken}`);
    expect(listResA.status).toBe(200);
    expect(listResA.body.data.items.map((c: { id: string }) => c.id)).toContain(customerId);

    const listResB = await request(app).get('/api/v1/customers').set('Authorization', `Bearer ${execBToken}`);
    expect(listResB.body.data.items.map((c: { id: string }) => c.id)).not.toContain(customerId);

    const getResB = await request(app).get(`/api/v1/customers/${customerId}`).set('Authorization', `Bearer ${execBToken}`);
    expect(getResB.status).toBe(403);
  });

  it('rejects a duplicate customer name within the same region', async () => {
    await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ name: 'Duplicate Co', type: 'Business' });

    const dupRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ name: 'Duplicate Co', type: 'Business' });
    expect(dupRes.status).toBe(400);
  });
});
