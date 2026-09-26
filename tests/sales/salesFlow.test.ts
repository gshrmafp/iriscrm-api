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
  let regionACode: string;
  let regionBId: string;
  let execAToken: string;
  let execBToken: string;
  let catalogItemId: string;

  // Stepped lead creation — Step 1 (site visit) with the fields now required
  // by saveStep1Schema.
  function step1Body(companyName: string) {
    return {
      companyName,
      remarks: 'Site visit remarks',
      gpsLatitude: 28.4595,
      gpsLongitude: 77.0266,
      visitLocation: 'Sector 21, Gurugram',
    };
  }

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();

    const regionA = await createTestRegion('SA');
    const regionB = await createTestRegion('SB');
    regionAId = regionA.id;
    regionACode = regionA.code;
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
      .post('/api/v1/leads/stepped')
      .set('Authorization', `Bearer ${execAToken}`)
      .send(step1Body('Test Customer'));
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.data.lead.id;
    expect(leadRes.body.data.lead.refNo).toMatch(new RegExp(`^${regionACode}\\d+$`));

    await request(app)
      .patch(`/api/v1/leads/${leadId}/step-2`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ contactName: 'Test Customer', contactPhone: '9876543210', discussionNote: 'Discussed requirements' });

    // Step 3 — REQUIREMENT_IDENTIFIED creates the Opportunity directly at
    // stage QUOTATION (the only way to create an Opportunity now).
    const step3Res = await request(app)
      .patch(`/api/v1/leads/${leadId}/step-3`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({
        path: 'REQUIREMENT_IDENTIFIED',
        dealType: 'INSTALLATION',
        quotationRef: 'Q-1001',
        quotationDate: new Date().toISOString(),
        quotationAmount: 20000,
      });
    expect(step3Res.status).toBe(201);
    const opportunityId = step3Res.body.data.opportunity.id;
    expect(step3Res.body.data.opportunity.stage).toBe('QUOTATION');

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

    // win() accepts an opportunity in QUOTATION, FOLLOWUP, or MEETING stage
    // and now requires PO details.
    const winRes = await request(app)
      .post(`/api/v1/opportunities/${opportunityId}/win`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ poNumber: 'PO-1001', poDate: new Date().toISOString(), poAmount: 2360, site: 'Test Site' });
    expect(winRes.status).toBe(200);
    expect(winRes.body.data.stage).toBe('PURCHASE_ORDER');

    const project = await prisma.project.findUnique({ where: { opportunityId } });
    expect(project).not.toBeNull();
    expect(project?.site).toBe('Test Site');
  });

  it('rejects a discount above the executive approval limit down to PENDING_APPROVAL', async () => {
    const leadRes = await request(app)
      .post('/api/v1/leads/stepped')
      .set('Authorization', `Bearer ${execAToken}`)
      .send(step1Body('Big Discount Customer'));
    const leadId = leadRes.body.data.lead.id;

    await request(app)
      .patch(`/api/v1/leads/${leadId}/step-2`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({ contactName: 'Big Discount Customer', contactPhone: '9876543211', discussionNote: 'Discussed requirements' });

    const step3Res = await request(app)
      .patch(`/api/v1/leads/${leadId}/step-3`)
      .set('Authorization', `Bearer ${execAToken}`)
      .send({
        path: 'REQUIREMENT_IDENTIFIED',
        dealType: 'AMC',
        quotationRef: 'Q-1002',
        quotationDate: new Date().toISOString(),
        quotationAmount: 10000,
      });
    const opportunityId = step3Res.body.data.opportunity.id;

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
      .post('/api/v1/leads/stepped')
      .set('Authorization', `Bearer ${execAToken}`)
      .send(step1Body('Region A Only'));
    const leadId = leadRes.body.data.lead.id;

    const crossRegionGet = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${execBToken}`);
    expect(crossRegionGet.status).toBe(403);

    const listAsB = await request(app).get('/api/v1/leads').set('Authorization', `Bearer ${execBToken}`);
    expect(listAsB.body.data.items.find((l: { id: string }) => l.id === leadId)).toBeUndefined();
  });
});
