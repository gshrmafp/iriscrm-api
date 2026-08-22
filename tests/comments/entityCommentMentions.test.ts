import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';
import { registerNotificationSubscribers } from '../../src/core/events/notificationSubscriber';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken as string;
}

// Leads and Opportunities share the same entityCommentService.create() code
// path (see comments/service.ts) — exercising it via Leads is sufficient
// coverage for both.
describe('Lead comment — @mention notifications', () => {
  let regionId: string;
  let otherRegionId: string;
  let execToken: string;
  let managerId: string;
  let managerToken: string;
  let outOfRegionUserId: string;
  let leadId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    registerNotificationSubscribers();

    const region = await createTestRegion('ECM');
    regionId = region.id;
    const otherRegion = await createTestRegion('ECM2');
    otherRegionId = otherRegion.id;

    const { user: exec, password: execPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'ecm-exec');
    const { user: manager, password: managerPw } = await createTestUser(Role.SALES_MANAGER, regionId, 'ecm-manager');
    const { user: outOfRegionUser } = await createTestUser(Role.SALES_EXECUTIVE, otherRegionId, 'ecm-outsider');
    managerId = manager.id;
    outOfRegionUserId = outOfRegionUser.id;
    execToken = await login(exec.email, execPw);
    managerToken = await login(manager.email, managerPw);

    const createRes = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Mention Test Customer', source: 'MANUAL' });
    leadId = createRes.body.data.lead.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [managerId, outOfRegionUserId] } } });
    await prisma.entityComment.deleteMany({ where: { entityId: leadId } });
    await prisma.lead.deleteMany({ where: { regionId } });
    await prisma.user.deleteMany({ where: { regionId: { in: [regionId, otherRegionId] } } });
    await prisma.region.deleteMany({ where: { id: { in: [regionId, otherRegionId] } } });
    await prisma.$disconnect();
  });

  it('notifies an in-region mentioned user', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: '@Manager please review this one', mentionedUserIds: [managerId] });
    expect(res.status).toBe(201);
    expect(res.body.data.mentionedUserIds).toEqual([managerId]);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const notifications = await prisma.notification.findMany({
      where: { userId: managerId, type: 'ENTITY_MENTIONED' },
    });
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].title).toContain('mentioned');
  });

  it('filters out a mentioned user from a different region — no notification', async () => {
    const res = await request(app)
      .post(`/api/v1/leads/${leadId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Mentioning someone out of region', mentionedUserIds: [outOfRegionUserId] });
    expect(res.status).toBe(201);
    expect(res.body.data.mentionedUserIds).toEqual([]);

    const notifications = await prisma.notification.findMany({
      where: { userId: outOfRegionUserId, type: 'ENTITY_MENTIONED' },
    });
    expect(notifications).toHaveLength(0);
  });

  it('does not notify on self-mention', async () => {
    const execSelfMention = await request(app)
      .post(`/api/v1/leads/${leadId}/comments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ body: 'Note to self', mentionedUserIds: [managerId] });
    expect(execSelfMention.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const notifications = await prisma.notification.findMany({
      where: { userId: managerId, type: 'ENTITY_MENTIONED' },
    });
    // Only the one from the first test (mentioned by exec) should exist —
    // the self-mention here must not add another.
    expect(notifications).toHaveLength(1);
  });
});
