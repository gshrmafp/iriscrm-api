import request from 'supertest';
import { NotificationType, Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken as string;
}

describe('Notifications', () => {
  let regionId: string;
  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('NOTIF');
    regionId = region.id;

    const { user: userA, password: pwA } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'notif-a');
    const { user: userB, password: pwB } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'notif-b');
    userAId = userA.id;
    userBId = userB.id;
    userAToken = await login(userA.email, pwA);
    userBToken = await login(userB.email, pwB);

    await prisma.notification.createMany({
      data: [
        { userId: userAId, type: NotificationType.QUERY_ASSIGNED, entityType: 'SalesQuery', entityId: 'q1', title: 'First' },
        { userId: userAId, type: NotificationType.QUERY_COMMENT_ADDED, entityType: 'SalesQuery', entityId: 'q1', title: 'Second' },
        { userId: userBId, type: NotificationType.QUERY_ASSIGNED, entityType: 'SalesQuery', entityId: 'q2', title: 'Someone else\'s' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('lists only the caller\'s own notifications, newest first', async () => {
    const res = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((n: { title: string }) => n.title !== "Someone else's")).toBe(true);
    expect(res.body.meta.total).toBe(2);
  });

  it('reports the correct unread count', async () => {
    const res = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it('rejects marking another user\'s notification as read', async () => {
    const bNotification = await prisma.notification.findFirstOrThrow({ where: { userId: userBId } });
    const res = await request(app)
      .post(`/api/v1/notifications/${bNotification.id}/read`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(403);
  });

  it('marks a single notification as read', async () => {
    const aNotification = await prisma.notification.findFirstOrThrow({ where: { userId: userAId, readAt: null } });
    const res = await request(app)
      .post(`/api/v1/notifications/${aNotification.id}/read`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.readAt).not.toBeNull();

    const countRes = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userAToken}`);
    expect(countRes.body.data.count).toBe(1);
  });

  it('marks all remaining notifications as read', async () => {
    const res = await request(app).post('/api/v1/notifications/read-all').set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);

    const countRes = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userAToken}`);
    expect(countRes.body.data.count).toBe(0);

    const bCountRes = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${userBToken}`);
    expect(bCountRes.body.data.count).toBe(1);
  });
});
