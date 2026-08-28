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

describe('GET /leads/follow-ups — cross-lead follow-up feed', () => {
  let regionId: string;
  let execToken: string;
  let leadOneId: string;
  let leadTwoId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('FU');
    regionId = region.id;
    const { user: exec, password } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'followup-exec');
    execToken = await login(exec.email, password);

    const leadOne = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Lead One', source: 'MANUAL' });
    leadOneId = leadOne.body.data.lead.id;
    const leadTwo = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ contactName: 'Lead Two', source: 'MANUAL' });
    leadTwoId = leadTwo.body.data.lead.id;

    await request(app)
      .post(`/api/v1/leads/${leadOneId}/follow-ups`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ note: 'Called, no answer', channel: 'call', nextActionAt: new Date(Date.now() + 86_400_000).toISOString() });
    await request(app)
      .post(`/api/v1/leads/${leadTwoId}/follow-ups`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ note: 'Sent brochure', channel: 'email' });
  });

  afterAll(async () => {
    await prisma.leadFollowUp.deleteMany({ where: { leadId: { in: [leadOneId, leadTwoId] } } });
    await prisma.lead.deleteMany({ where: { regionId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('returns follow-ups from both leads with the lead embedded, due-soonest first', async () => {
    const res = await request(app).get('/api/v1/leads/follow-ups').set('Authorization', `Bearer ${execToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].lead.id).toBe(leadOneId); // has nextActionAt, sorts before the null one
    expect(res.body.data.items[0].lead.contactName).toBe('Lead One');
    expect(res.body.data.items[1].lead.id).toBe(leadTwoId);
  });

  it('defaults priority to MEDIUM, accepts an explicit priority, and completes a follow-up', async () => {
    const listRes = await request(app).get('/api/v1/leads/follow-ups').set('Authorization', `Bearer ${execToken}`);
    const followUp = listRes.body.data.items.find((item: { leadId: string }) => item.leadId === leadTwoId);
    expect(followUp.priority).toBe('MEDIUM');
    expect(followUp.completedAt).toBeNull();

    const highPriorityRes = await request(app)
      .post(`/api/v1/leads/${leadOneId}/follow-ups`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ note: 'Urgent callback', channel: 'call', priority: 'HIGH' });
    expect(highPriorityRes.body.data.priority).toBe('HIGH');

    const completeRes = await request(app)
      .post(`/api/v1/leads/follow-ups/${followUp.id}/complete`)
      .set('Authorization', `Bearer ${execToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.completedAt).not.toBeNull();

    const alreadyCompleteRes = await request(app)
      .post(`/api/v1/leads/follow-ups/${followUp.id}/complete`)
      .set('Authorization', `Bearer ${execToken}`);
    expect(alreadyCompleteRes.status).toBe(400);
  });

  it('returns real, derived active/needs-attention lead counts on the dashboard summary', async () => {
    const res = await request(app).get('/api/v1/leads/dashboard-summary').set('Authorization', `Bearer ${execToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.activeCount).toBe(2);
    // Both leads have a follow-up logged just now, so neither is stale yet.
    expect(res.body.data.needAttentionCount).toBe(0);
  });
});
