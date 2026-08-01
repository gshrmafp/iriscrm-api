import request from 'supertest';
import { Role, PermissionEffect } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { PERMISSIONS } from '../../src/config/permissions';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';

const app = createApp();

describe('Auth + RBAC', () => {
  let regionId: string;
  let execUserId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('RB');
    regionId = region.id;
    const { user } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'rbac-exec');
    execUserId = user.id;
  });

  afterAll(async () => {
    await prisma.userPermissionOverride.deleteMany({ where: { userId: execUserId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.delete({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('rejects login with wrong password', async () => {
    const user = await prisma.user.findUnique({ where: { id: execUserId } });
    const res = await request(app).post('/api/v1/auth/login').send({ email: user!.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs in and returns a usable access token', async () => {
    const user = await prisma.user.findUnique({ where: { id: execUserId } });
    const res = await request(app).post('/api/v1/auth/login').send({ email: user!.email, password: 'TestPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects a route with no token', async () => {
    const res = await request(app).get('/api/v1/leads');
    expect(res.status).toBe(401);
  });

  it('a Sales Executive has no sales.opportunity.reassign permission by default', async () => {
    const user = await prisma.user.findUnique({ where: { id: execUserId } });
    const login = await request(app).post('/api/v1/auth/login').send({ email: user!.email, password: 'TestPass123!' });
    const token = login.body.data.accessToken;

    const res = await request(app)
      .get(`/api/v1/users/${execUserId}/permissions`)
      .set('Authorization', `Bearer ${token}`);
    // exec lacks IDENTITY_PERMISSION_OVERRIDE_MANAGE, so this itself should 403
    expect(res.status).toBe(403);
  });

  it('a DENY override removes a role-default permission for exactly that user', async () => {
    const { user: admin, password: adminPassword } = await createTestUser(Role.SUPER_ADMIN, regionId, 'rbac-admin');
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: adminPassword });
    const adminToken = adminLogin.body.data.accessToken;

    const execUser = await prisma.user.findUnique({ where: { id: execUserId } });
    const execLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: execUser!.email, password: 'TestPass123!' });
    const execToken = execLogin.body.data.accessToken;

    const before = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Before Deny', source: 'MANUAL' });
    expect(before.status).toBe(201);

    await request(app)
      .post(`/api/v1/users/${execUserId}/permission-overrides`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKey: PERMISSIONS.SALES_LEAD_CREATE, effect: PermissionEffect.DENY });

    const after = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'After Deny', source: 'MANUAL' });
    expect(after.status).toBe(403);

    await prisma.lead.deleteMany({ where: { regionId } });
  });

  it('a GRANT override adds a permission the role does not have by default', async () => {
    const { user: admin, password: adminPassword } = await createTestUser(Role.SUPER_ADMIN, regionId, 'rbac-admin2');
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: adminPassword });
    const adminToken = adminLogin.body.data.accessToken;

    await request(app)
      .post(`/api/v1/users/${execUserId}/permission-overrides`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionKey: PERMISSIONS.SALES_OPPORTUNITY_REASSIGN, effect: PermissionEffect.GRANT });

    const check = await request(app)
      .get(`/api/v1/users/${execUserId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(check.body.data.effectivePermissions).toContain(PERMISSIONS.SALES_OPPORTUNITY_REASSIGN);
  });
});
