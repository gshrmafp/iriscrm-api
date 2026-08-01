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

describe('Sales module — happy path + region isolation', () => {
  let regionAId: string;
  let regionBId: string;
  let execAToken: string;
  let execBToken: string;
  let catalogItemId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();

    const regionA = await createTestRegion('SA');
    const regionB = await createTestRegion('SB');
    regionAId = regionA.id;
    regionBId = regionB.id;

    const { user: execA, password: pwA } = await createTestUser(Role.SALES_EXECUTIVE, regionAId, 'sales-exec-a');
    const { user: execB, password: pwB } = await createTestUser(Role.SALES_EXECUTIVE, regionBId, 'sales-exec-b');
    execAToken = await login(execA.email, pwA);
    execBToken = await login(execB.email, pwB);

    const { user: admin, password: adminPw } = await createTestUser(Role.SUPER_ADMIN, regionAId, 'sales-admin');
    const adminToken = await login(admin.email, adminPw);

    const catalogRes = await request(app)
      .post('/api/v1/catalog/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `TST-${Date.now()}`, name: 'Test Widget', category: 'Test', unit: 'pcs', basePrice: 1000, taxClass: 'GST18' });
    catalogItemId = catalogRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.quotationLine.deleteMany({ where: { catalogItem: { id: catalogItemId } } });
    await prisma.quotation.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.project.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.opportunityStageHistory.deleteMany({});
    await prisma.opportunity.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.leadFollowUp.deleteMany({});
    await prisma.lead.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.catalogItem.deleteMany({ where: { id: catalogItemId } });
    await prisma.user.deleteMany({ where: { regionId: { in: [regionAId, regionBId] } } });
    await prisma.region.deleteMany({ where: { id: { in: [regionAId, regionBId] } } });
    await prisma.$disconnect();
  });

  it('runs lead -> opportunity -> quotation -> win end to end', async () => {
    const leadRes = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ contactName: 'Test Customer', source: 'MANUAL' });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.data.lead.id;
    expect(leadRes.body.data.lead.refNo).toMatch(/-L-\d{6}$/);

    const qualifyRes = await request(app)
      .post(`/api/v1/leads/${leadId}/qualify`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ dealType: 'INSTALLATION', value: 20000 });
    expect(qualifyRes.status).toBe(201);
    const opportunityId = qualifyRes.body.data.id;
    expect(qualifyRes.body.data.stage).toBe('NEW');

    await request(app)
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ toStage: 'CONTACTED' });
    const toQuoted = await request(app)
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ toStage: 'QUOTED' });
    expect(toQuoted.status).toBe(200);

    const quoteRes = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({
        opportunityId,
        lines: [{ catalogItemId, description: 'Widget x2', qty: 2, unitPrice: 1000, discount: 0, taxRatePct: 18 }],
      });
    expect(quoteRes.status).toBe(201);
    expect(quoteRes.body.data.grandTotal).toBe('2360'); // 2000 subtotal, 18% tax, no discount

    const submitRes = await request(app)
      .post(`/api/v1/quotations/${quoteRes.body.data.id}/submit`)
      .set('Authorization', `Bearer ${execAToken}`);
    expect(submitRes.body.data.status).toBe('APPROVED'); // within exec's own limit -> self-approves

    // win() accepts an opportunity in either QUOTED or NEGOTIATION stage
    const winRes = await request(app)
      .post(`/api/v1/opportunities/${opportunityId}/win`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ site: 'Test Site' });
    expect(winRes.status).toBe(200);
    expect(winRes.body.data.stage).toBe('WON');

    const project = await prisma.project.findUnique({ where: { opportunityId } });
    expect(project).not.toBeNull();
    expect(project?.site).toBe('Test Site');
  });

  it('rejects a discount above the executive approval limit down to PENDING_APPROVAL', async () => {
    const leadRes = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ contactName: 'Big Discount Customer', source: 'MANUAL' });
    const leadId = leadRes.body.data.lead.id;

    const qualifyRes = await request(app)
      .post(`/api/v1/leads/${leadId}/qualify`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ dealType: 'PRODUCT', value: 10000 });
    const opportunityId = qualifyRes.body.data.id;

    const quoteRes = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({
        opportunityId,
        // 20% discount exceeds the Sales Executive's 5% limit (Section 4.3 example)
        lines: [{ catalogItemId, description: 'Widget x1', qty: 1, unitPrice: 1000, discount: 200, taxRatePct: 0 }],
      });

    const submitRes = await request(app)
      .post(`/api/v1/quotations/${quoteRes.body.data.id}/submit`)
      .set('Authorization', `Bearer ${execAToken}`);
    expect(submitRes.body.data.status).toBe('PENDING_APPROVAL');
  });

  it('isolates leads by region — an exec in region B cannot see region A leads', async () => {
    const leadRes = await request(app)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ contactName: 'Region A Only', source: 'MANUAL' });
    const leadId = leadRes.body.data.lead.id;

    const crossRegionGet = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${execBToken}`);
    expect(crossRegionGet.status).toBe(403);

    const listAsB = await request(app).get('/api/v1/leads').set('Authorization', `Bearer ${execBToken}`);
    expect(listAsB.body.data.items.find((l: { id: string }) => l.id === leadId)).toBeUndefined();
  });
});
