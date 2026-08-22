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

describe('Live active/inactive enforcement (requireAuth)', () => {
  let regionId: string;
  let execId: string;
  let superAdminToken: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('AEF');
    regionId = region.id;

    const { user: superAdmin, password: superAdminPw } = await createTestUser(Role.SUPER_ADMIN, regionId, 'aef-superadmin');
    superAdminToken = await login(superAdmin.email, superAdminPw);
    execId = superAdmin.id; // reassigned per-test below where needed
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('rejects a request with a still-valid token once the user is deactivated mid-session', async () => {
    const { user: exec, password: execPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'aef-exec');
    execId = exec.id;
    const execToken = await login(exec.email, execPw);

    // Sanity check: the token works before deactivation.
    const before = await request(app).get('/api/v1/regions').set('Authorization', `Bearer ${execToken}`);
    expect(before.status).toBe(200);

    await request(app)
      .patch(`/api/v1/users/${execId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'INACTIVE' });

    // Same, still-unexpired access token — must now be rejected.
    const after = await request(app).get('/api/v1/regions').set('Authorization', `Bearer ${execToken}`);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects a normal-role user once their region is deactivated, but not a Super Admin in the same region', async () => {
    const { user: exec2, password: exec2Pw } = await createTestUser(Role.SALES_MANAGER, regionId, 'aef-manager');
    const exec2Token = await login(exec2.email, exec2Pw);

    await request(app)
      .patch(`/api/v1/regions/${regionId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ active: false });

    const managerRes = await request(app).get('/api/v1/regions').set('Authorization', `Bearer ${exec2Token}`);
    expect(managerRes.status).toBe(403);
    expect(managerRes.body.error.code).toBe('REGION_INACTIVE');

    // Super Admin is exempt from their own region's active flag.
    const superAdminRes = await request(app).get('/api/v1/regions').set('Authorization', `Bearer ${superAdminToken}`);
    expect(superAdminRes.status).toBe(200);

    // Reactivate for cleanliness (not strictly required since the region is deleted in afterAll).
    await request(app)
      .patch(`/api/v1/regions/${regionId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ active: true });
  });
});
