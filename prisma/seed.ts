import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { faker } from '@faker-js/faker';
import {
  PrismaClient,
  Role,
  DealType,
  OpportunityStage,
  QuotationStatus,
  DepartmentMemberRole,
  MeetingType,
  QueryPriority,
  SalesQueryStatus,
  PicklistType,
  LeadStatus,
  FollowUpStatus,
  PriceRuleType,
  Prisma,
} from '@prisma/client';
import { ROLE_DEFAULT_PERMISSIONS } from '../src/config/permissions';
import { STAGE_PROBABILITY } from '../src/modules/sales/opportunities/pipeline';
import { generateId } from '../src/core/utils/idGenerator';

const prisma = new PrismaClient();

const SAMPLE_PASSWORD = process.env.SEED_SAMPLE_PASSWORD ?? 'Password123!';

// ---------------------------------------------------------------------------
// Small helpers shared by the bulk generator below
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

// Picks one entry from `[value, weight][]` proportional to its weight.
function weightedPick<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function randomDateBetween(monthsAgo: number, to: Date = new Date()): Date {
  const from = new Date(to);
  from.setMonth(from.getMonth() - monthsAgo);
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function laterDate(from: Date, maxDaysLater: number): Date {
  return new Date(from.getTime() + randomInt(0, maxDaysLater) * 24 * 60 * 60 * 1000);
}

// Indian mobile number matching the app's MOBILE_REGEX (10 digits, starts 6-9).
function indianMobile(): string {
  return `${randomInt(6, 9)}${faker.string.numeric(9)}`;
}

// Batched createMany — 10-20x faster than row-by-row .create() for bulk seeding.
async function batchCreateMany<T>(
  label: string,
  rows: T[],
  create: (chunk: T[]) => Promise<Prisma.BatchPayload>,
  batchSize = 1000,
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await create(chunk);
  }
  console.log(`  ${label}: ${rows.length} rows`);
}

async function upsertUser(params: { name: string; email: string; role: Role; regionId: string; reportingToId?: string }) {
  const passwordHash = await argon2.hash(SAMPLE_PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  const id = existing ? existing.id : await generateId('USER');

  return prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      id,
      name: params.name,
      email: params.email,
      passwordHash,
      role: params.role,
      regionId: params.regionId,
      reportingToId: params.reportingToId,
    },
  });
}

// ---------------------------------------------------------------------------
// Large-scale, randomized dataset for exercising dashboards, pagination,
// filters, reports, and charts against something closer to production
// volume. Fully idempotent: skipped entirely once bulk data already exists
// (checked via customer count), so re-running `npm run prisma:seed` after the
// first bulk pass stays fast. Takes roughly 30-90s on a local Postgres.
// ---------------------------------------------------------------------------
async function seedBulkData(namedRegions: { ggn: { id: string; code: string }; dl: { id: string; code: string } }) {
  const existingCustomerCount = await prisma.customer.count();
  if (existingCustomerCount >= 1000) {
    console.log('\nBulk dataset already present — skipped.');
    return;
  }

  console.log('\nGenerating a large, randomized dataset (this takes a minute)...');
  const startedAt = Date.now();

  // --- Regions (10 total, including the two named ones already seeded) ----
  const extraRegionDefs = [
    { code: 'MUM', name: 'Mumbai' },
    { code: 'BLR', name: 'Bengaluru' },
    { code: 'PUN', name: 'Pune' },
    { code: 'HYD', name: 'Hyderabad' },
    { code: 'CHN', name: 'Chennai' },
    { code: 'KOL', name: 'Kolkata' },
    { code: 'AMD', name: 'Ahmedabad' },
    { code: 'JAI', name: 'Jaipur' },
  ];
  const extraRegions = [];
  for (const def of extraRegionDefs) {
    extraRegions.push(await prisma.region.upsert({ where: { code: def.code }, update: {}, create: def }));
  }
  const regions = [namedRegions.ggn, namedRegions.dl, ...extraRegions] as { id: string; code: string }[];

  // --- Users (~100): a Regional Admin + a couple Sales Managers per region,
  // the rest Sales Executives (reporting to one of that region's managers)
  // and a few Auditors. Shares one pre-hashed password for speed. ----------
  const bulkPasswordHash = await argon2.hash(SAMPLE_PASSWORD);
  type SeedUser = { id: string; regionId: string; role: Role };
  const usersByRegion = new Map<string, SeedUser[]>();
  const managersByRegion = new Map<string, string[]>();
  const execsByRegion = new Map<string, string[]>();
  const allUserIds: string[] = [];

  const userRows: Prisma.UserCreateManyInput[] = [];
  for (const region of regions) {
    const regionUsers: SeedUser[] = [];
    const regionManagers: string[] = [];
    const regionExecs: string[] = [];

    // 1 Regional Admin per region (skip GGN/DL — already have named admins).
    const isNamedRegion = region.code === 'GGN' || region.code === 'DL';
    if (!isNamedRegion) {
      const adminId = randomUUID();
      userRows.push({
        id: adminId,
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        passwordHash: bulkPasswordHash,
        role: Role.REGIONAL_ADMIN,
        regionId: region.id,
      });
      regionUsers.push({ id: adminId, regionId: region.id, role: Role.REGIONAL_ADMIN });
    }

    // 2-3 Sales Managers per region.
    for (let i = 0; i < randomInt(2, 3); i++) {
      const managerId = randomUUID();
      userRows.push({
        id: managerId,
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        passwordHash: bulkPasswordHash,
        role: Role.SALES_MANAGER,
        regionId: region.id,
      });
      regionUsers.push({ id: managerId, regionId: region.id, role: Role.SALES_MANAGER });
      regionManagers.push(managerId);
    }

    // ~6-10 Sales Executives per region, reporting to a random manager.
    for (let i = 0; i < randomInt(6, 10); i++) {
      const execId = randomUUID();
      userRows.push({
        id: execId,
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        passwordHash: bulkPasswordHash,
        role: Role.SALES_EXECUTIVE,
        regionId: region.id,
        reportingToId: regionManagers.length ? randomItem(regionManagers) : undefined,
      });
      regionUsers.push({ id: execId, regionId: region.id, role: Role.SALES_EXECUTIVE });
      regionExecs.push(execId);
    }

    // 1 Auditor per region.
    const auditorId = randomUUID();
    userRows.push({
      id: auditorId,
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      passwordHash: bulkPasswordHash,
      role: Role.AUDITOR,
      regionId: region.id,
    });
    regionUsers.push({ id: auditorId, regionId: region.id, role: Role.AUDITOR });

    usersByRegion.set(region.id, regionUsers);
    managersByRegion.set(region.id, regionManagers);
    execsByRegion.set(region.id, regionExecs);
    allUserIds.push(...regionUsers.map((u) => u.id));
  }
  await batchCreateMany('Users', userRows, (chunk) => prisma.user.createMany({ data: chunk, skipDuplicates: true }));

  // Fold in the two named regions' existing exec/manager (needed so leads etc.
  // generated for GGN/DL have someone real to own them too).
  for (const region of [namedRegions.ggn, namedRegions.dl]) {
    const existing = await prisma.user.findMany({ where: { regionId: region.id }, select: { id: true, role: true } });
    execsByRegion.set(region.id, [
      ...(execsByRegion.get(region.id) ?? []),
      ...existing.filter((u) => u.role === Role.SALES_EXECUTIVE).map((u) => u.id),
    ]);
    managersByRegion.set(region.id, [
      ...(managersByRegion.get(region.id) ?? []),
      ...existing.filter((u) => u.role === Role.SALES_MANAGER).map((u) => u.id),
    ]);
  }

  function randomExecFor(regionId: string): string {
    const execs = execsByRegion.get(regionId) ?? [];
    return execs.length ? randomItem(execs) : randomItem(allUserIds);
  }
  function randomUserFor(regionId: string): string {
    const users = usersByRegion.get(regionId) ?? [];
    return users.length ? randomItem(users.map((u) => u.id)) : randomItem(allUserIds);
  }

  // --- Departments (~20) + members (~150) ----------------------------------
  const departmentDefs = [
    'Technical', 'Procurement', 'Accounts', 'Finance', 'Logistics', 'Quality Assurance',
    'Customer Support', 'Legal', 'Human Resources', 'IT Infrastructure', 'Marketing',
    'Administration', 'Warehouse', 'Research & Development', 'Installation Services',
    'Field Service', 'Billing', 'Compliance', 'Training', 'Vendor Management',
  ];
  const departments: { id: string; regionId: string | null }[] = [];
  for (let i = 0; i < departmentDefs.length; i++) {
    const name = departmentDefs[i];
    const code = name.toUpperCase().replace(/[^A-Z]+/g, '_').slice(0, 20);
    const regionId = i % 3 === 0 ? null : randomItem(regions).id; // ~1/3 shared, rest region-scoped
    const dept = await prisma.department.upsert({
      where: { code },
      update: {},
      create: { code, name, regionId },
    });
    departments.push({ id: dept.id, regionId: dept.regionId });
  }

  const memberRows: Prisma.DepartmentMemberCreateManyInput[] = [];
  const seenMembership = new Set<string>();
  for (let i = 0; i < 150; i++) {
    const dept = randomItem(departments);
    const candidateUserId = dept.regionId ? randomUserFor(dept.regionId) : randomItem(allUserIds);
    const key = `${dept.id}:${candidateUserId}`;
    if (seenMembership.has(key)) continue;
    seenMembership.add(key);
    memberRows.push({
      departmentId: dept.id,
      userId: candidateUserId,
      roleInDept: Math.random() < 0.2 ? DepartmentMemberRole.MANAGER : DepartmentMemberRole.EMPLOYEE,
    });
  }
  await batchCreateMany('Department members', memberRows, (chunk) =>
    prisma.departmentMember.createMany({ data: chunk, skipDuplicates: true }),
  );

  // --- Catalog (~300 items across ~25 categories) + price rules -----------
  const categories = [
    'CCTV', 'Access Control', 'Networking', 'Storage', 'Recorder', 'Cabling', 'Power Backup',
    'Fire Safety', 'Biometric', 'Software License', 'Service', 'Installation', 'AMC', 'Sensors',
    'Alarms', 'Intercom', 'Video Analytics', 'Cloud Storage', 'Mounting Hardware', 'Cables',
    'Connectors', 'Switches', 'Routers', 'UPS', 'Batteries',
  ];
  const taxClasses = ['GST5', 'GST12', 'GST18', 'GST28'];
  const catalogRows: Prisma.CatalogItemCreateManyInput[] = [];
  const catalogIds: string[] = [];
  for (let i = 0; i < 300; i++) {
    const id = randomUUID();
    catalogIds.push(id);
    catalogRows.push({
      id,
      code: `PDT-${(i + 1).toString().padStart(4, '0')}`,
      name: faker.commerce.productName(),
      category: randomItem(categories),
      unit: randomItem(['pcs', 'job', 'set', 'meter', 'license']),
      basePrice: randomInt(500, 50000),
      taxClass: randomItem(taxClasses),
    });
  }
  await batchCreateMany('Catalog items', catalogRows, (chunk) =>
    prisma.catalogItem.createMany({ data: chunk, skipDuplicates: true }),
  );

  const priceRuleRows: Prisma.PriceRuleCreateManyInput[] = [];
  for (let i = 0; i < 80; i++) {
    priceRuleRows.push({
      catalogItemId: randomItem(catalogIds),
      regionId: Math.random() < 0.5 ? randomItem(regions).id : null,
      ruleType: randomItem(Object.values(PriceRuleType)),
      value: randomInt(50, 5000),
      effectiveFrom: randomDateBetween(12),
    });
  }
  await batchCreateMany('Price rules', priceRuleRows, (chunk) => prisma.priceRule.createMany({ data: chunk }));

  // --- Customers (3,000) ----------------------------------------------------
  const TOTAL_CUSTOMERS = 3000;
  const customerRows: Prisma.CustomerCreateManyInput[] = [];
  const customersByRegion = new Map<string, string[]>();
  for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
    const region = randomItem(regions);
    const id = randomUUID();
    const isBusiness = Math.random() < 0.75;
    customerRows.push({
      id,
      name: isBusiness ? faker.company.name() : faker.person.fullName(),
      type: isBusiness ? 'Business' : 'Individual',
      active: Math.random() > 0.05,
      contacts: [{ name: faker.person.fullName(), phone: indianMobile(), email: faker.internet.email().toLowerCase() }],
      addresses: [{
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        pincode: faker.location.zipCode('######'),
      }],
      regionId: region.id,
      createdBy: randomUserFor(region.id),
      createdAt: randomDateBetween(18),
    });
    customersByRegion.set(region.id, [...(customersByRegion.get(region.id) ?? []), id]);
  }
  await batchCreateMany('Customers', customerRows, (chunk) =>
    prisma.customer.createMany({ data: chunk, skipDuplicates: true }),
  );

  // --- Leads (10,000) + Lead Follow-ups (~30,000) ---------------------------
  const TOTAL_LEADS = 10000;
  const leadSourceCodes = ['MANUAL', 'WEB_FORM', 'PHONE_IN', 'REFERRAL', 'EXISTING_CUSTOMER'];
  const productInterestCodes = ['CCTV_INSTALLATION', 'ACCESS_CONTROL', 'AMC_RENEWAL', 'OFFICE_FURNITURE', 'IT_HARDWARE', 'OTHER'];
  const leadRefCounters = new Map<string, number>();
  const leadRows: Prisma.LeadCreateManyInput[] = [];
  const leadRecords: { id: string; regionId: string; ownerId: string; createdAt: Date; status: LeadStatus }[] = [];

  for (let i = 0; i < TOTAL_LEADS; i++) {
    const region = randomItem(regions);
    const ownerId = randomExecFor(region.id);
    const createdAt = randomDateBetween(18);
    const status = weightedPick<LeadStatus>([
      [LeadStatus.NEW, 60],
      [LeadStatus.QUALIFIED, 25],
      [LeadStatus.LOST, 15],
    ]);
    const counter = (leadRefCounters.get(region.code) ?? 900000) + 1;
    leadRefCounters.set(region.code, counter);
    const id = randomUUID();
    const regionCustomers = customersByRegion.get(region.id) ?? [];

    leadRows.push({
      id,
      refNo: `${region.code}-L-${counter}`,
      customerId: regionCustomers.length && Math.random() < 0.6 ? randomItem(regionCustomers) : null,
      contactName: faker.person.fullName(),
      companyName: Math.random() < 0.7 ? faker.company.name() : null,
      contactPhone: indianMobile(),
      contactEmail: Math.random() < 0.8 ? faker.internet.email().toLowerCase() : null,
      gpsLatitude: Math.random() < 0.3 ? faker.location.latitude({ min: 8, max: 34 }) : null,
      gpsLongitude: Math.random() < 0.3 ? faker.location.longitude({ min: 68, max: 89 }) : null,
      source: randomItem(leadSourceCodes),
      productInterest: Math.random() < 0.7 ? randomItem(productInterestCodes) : null,
      notes: Math.random() < 0.5 ? faker.lorem.sentence() : null,
      status,
      lostReason: status === LeadStatus.LOST ? randomItem(['price', 'competitor', 'no_budget', 'no_response', 'other']) : null,
      regionId: region.id,
      ownerId,
      createdBy: ownerId,
      createdAt,
      updatedAt: createdAt,
    });
    leadRecords.push({ id, regionId: region.id, ownerId, createdAt, status });
  }
  await batchCreateMany('Leads', leadRows, (chunk) => prisma.lead.createMany({ data: chunk, skipDuplicates: true }));

  const followUpChannels = ['call', 'meeting', 'email', 'whatsapp'];
  const followUpRows: Prisma.LeadFollowUpCreateManyInput[] = [];
  for (const lead of leadRecords) {
    const count = randomInt(0, 5);
    for (let i = 0; i < count; i++) {
      const createdAt = laterDate(lead.createdAt, 60);
      followUpRows.push({
        leadId: lead.id,
        note: faker.lorem.sentence(),
        channel: randomItem(followUpChannels),
        nextActionAt: Math.random() < 0.4 ? laterDate(createdAt, 14) : null,
        createdBy: lead.ownerId,
        createdAt,
      });
    }
  }
  await batchCreateMany('Lead follow-ups', followUpRows, (chunk) => prisma.leadFollowUp.createMany({ data: chunk }));

  // --- Opportunities (6,000) + Stage history (~25,000) ----------------------
  const qualifiedLeads = leadRecords.filter((l) => l.status !== LeadStatus.LOST);
  const TOTAL_OPPORTUNITIES = Math.min(6000, qualifiedLeads.length);
  faker.helpers.shuffle(qualifiedLeads);
  const opportunityLeads = qualifiedLeads.slice(0, TOTAL_OPPORTUNITIES);

  const oppStagePath: OpportunityStage[] = [
    OpportunityStage.NEW,
    OpportunityStage.CONTACTED,
    OpportunityStage.QUOTED,
    OpportunityStage.NEGOTIATION,
  ];
  const opportunityRows: Prisma.OpportunityCreateManyInput[] = [];
  const opportunityRecords: {
    id: string;
    leadId: string;
    regionId: string;
    ownerId: string;
    stage: OpportunityStage;
    value: number;
    createdAt: Date;
  }[] = [];
  const stageHistoryRows: Prisma.OpportunityStageHistoryCreateManyInput[] = [];
  const qualifiedLeadIds: string[] = [];

  for (const lead of opportunityLeads) {
    const id = randomUUID();
    const finalStage = weightedPick<OpportunityStage>([
      [OpportunityStage.NEW, 10],
      [OpportunityStage.CONTACTED, 15],
      [OpportunityStage.QUOTED, 20],
      [OpportunityStage.NEGOTIATION, 15],
      [OpportunityStage.WON, 25],
      [OpportunityStage.LOST, 15],
    ]);
    const value = randomInt(10000, 1500000);
    const createdAt = laterDate(lead.createdAt, 10);
    const wonOrLost = finalStage === OpportunityStage.WON || finalStage === OpportunityStage.LOST;
    const traversedPath = wonOrLost
      ? oppStagePath
      : oppStagePath.slice(0, oppStagePath.indexOf(finalStage) + 1);

    opportunityRows.push({
      id,
      leadId: lead.id,
      dealType: randomItem(Object.values(DealType)),
      value,
      stage: finalStage,
      probability: STAGE_PROBABILITY[finalStage],
      expectedClose: finalStage === OpportunityStage.WON || finalStage === OpportunityStage.LOST ? null : laterDate(createdAt, 60),
      lostReason: finalStage === OpportunityStage.LOST ? randomItem(['price', 'competitor', 'no_budget', 'timeline']) : null,
      wonAt: finalStage === OpportunityStage.WON ? laterDate(createdAt, 45) : null,
      regionId: lead.regionId,
      ownerId: lead.ownerId,
      createdBy: lead.ownerId,
      createdAt,
      updatedAt: createdAt,
    });
    opportunityRecords.push({ id, leadId: lead.id, regionId: lead.regionId, ownerId: lead.ownerId, stage: finalStage, value, createdAt });
    qualifiedLeadIds.push(lead.id);

    let prev: OpportunityStage | null = null;
    let historyDate = createdAt;
    for (const stage of traversedPath) {
      stageHistoryRows.push({ opportunityId: id, fromStage: prev, toStage: stage, actorId: lead.ownerId, createdAt: historyDate });
      prev = stage;
      historyDate = laterDate(historyDate, 10);
    }
    if (wonOrLost) {
      stageHistoryRows.push({ opportunityId: id, fromStage: prev, toStage: finalStage, actorId: lead.ownerId, createdAt: historyDate });
    }
  }
  await batchCreateMany('Opportunities', opportunityRows, (chunk) =>
    prisma.opportunity.createMany({ data: chunk, skipDuplicates: true }),
  );
  await batchCreateMany('Opportunity stage history', stageHistoryRows, (chunk) =>
    prisma.opportunityStageHistory.createMany({ data: chunk }),
  );
  await batchCreateMany('Lead status updates (qualified)', qualifiedLeadIds.map((id) => ({ id })), async (chunk) => {
    await prisma.lead.updateMany({ where: { id: { in: chunk.map((c) => c.id) } }, data: { status: LeadStatus.QUALIFIED } });
    return { count: chunk.length };
  });

  // --- Quotations (~4,000) + Quotation lines (~20,000+) ---------------------
  const quotableStages: OpportunityStage[] = [
    OpportunityStage.QUOTED,
    OpportunityStage.NEGOTIATION,
    OpportunityStage.WON,
    OpportunityStage.LOST,
  ];
  const quotable = opportunityRecords.filter((o) => quotableStages.includes(o.stage));
  const TOTAL_QUOTATIONS = Math.min(4000, quotable.length);
  faker.helpers.shuffle(quotable);
  const quotationTargets = quotable.slice(0, TOTAL_QUOTATIONS);

  const quotationRows: Prisma.QuotationCreateManyInput[] = [];
  const quotationLineRows: Prisma.QuotationLineCreateManyInput[] = [];
  for (const opp of quotationTargets) {
    const quotationId = randomUUID();
    const lineCount = randomInt(3, 8);
    let subtotal = 0;
    let taxTotal = 0;
    const lines: Prisma.QuotationLineCreateManyInput[] = [];
    for (let i = 0; i < lineCount; i++) {
      const catalogItemId = randomItem(catalogIds);
      const qty = randomInt(1, 20);
      const unitPrice = randomInt(500, 20000);
      const discount = Math.random() < 0.3 ? Math.round(unitPrice * qty * 0.05) : 0;
      const taxable = unitPrice * qty - discount;
      const tax = Math.round(taxable * 0.18);
      const lineTotal = taxable + tax;
      subtotal += unitPrice * qty;
      taxTotal += tax;
      lines.push({
        quotationId,
        catalogItemId,
        description: faker.commerce.productDescription().slice(0, 80),
        qty,
        unitPrice,
        discount,
        tax,
        lineTotal,
      });
    }
    const discountTotal = lines.reduce((sum, l) => sum + Number(l.discount ?? 0), 0);
    const grandTotal = subtotal - discountTotal + taxTotal;
    const status =
      opp.stage === OpportunityStage.WON
        ? QuotationStatus.ACCEPTED
        : opp.stage === OpportunityStage.LOST
          ? randomItem([QuotationStatus.REJECTED, QuotationStatus.EXPIRED])
          : weightedPick<QuotationStatus>([
              [QuotationStatus.DRAFT, 20],
              [QuotationStatus.PENDING_APPROVAL, 15],
              [QuotationStatus.APPROVED, 20],
              [QuotationStatus.SENT, 45],
            ]);
    const createdAt = laterDate(opp.createdAt, 20);

    quotationRows.push({
      id: quotationId,
      opportunityId: opp.id,
      version: 1,
      status,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      validTill: laterDate(createdAt, 30),
      approvedById: status === QuotationStatus.APPROVED || status === QuotationStatus.SENT || status === QuotationStatus.ACCEPTED ? opp.ownerId : null,
      approvedAt: status === QuotationStatus.APPROVED || status === QuotationStatus.SENT || status === QuotationStatus.ACCEPTED ? createdAt : null,
      regionId: opp.regionId,
      createdBy: opp.ownerId,
      createdAt,
      updatedAt: createdAt,
    });
    quotationLineRows.push(...lines);
  }
  await batchCreateMany('Quotations', quotationRows, (chunk) =>
    prisma.quotation.createMany({ data: chunk, skipDuplicates: true }),
  );
  await batchCreateMany('Quotation lines', quotationLineRows, (chunk) => prisma.quotationLine.createMany({ data: chunk }));

  // --- Sales Queries (5,000) + comments (~15,000) + activities + follow-ups (~8,000) ---
  const TOTAL_QUERIES = 5000;
  const queryRefCounters = new Map<number, number>();
  const meetingTypes = Object.values(MeetingType);
  const priorities = Object.values(QueryPriority);
  const allTags = ['hot-lead', 'cctv', 'corporate', 'urgent', 'referral', 'amc', 'walk-in', 'repeat-customer'];
  const queryStatuses = Object.values(SalesQueryStatus);

  const queryRows: Prisma.SalesQueryCreateManyInput[] = [];
  const queryRecords: { id: string; regionId: string; ownerId: string; departmentId: string | null; createdAt: Date }[] = [];

  for (let i = 0; i < TOTAL_QUERIES; i++) {
    const region = randomItem(regions);
    const ownerId = randomExecFor(region.id);
    const createdAt = randomDateBetween(18);
    const year = createdAt.getFullYear();
    const counter = (queryRefCounters.get(year) ?? 90000) + 1;
    queryRefCounters.set(year, counter);
    const id = randomUUID();
    const regionCustomers = customersByRegion.get(region.id) ?? [];
    const regionDepartments = departments.filter((d) => d.regionId === null || d.regionId === region.id);
    const departmentId = Math.random() < 0.7 && regionDepartments.length ? randomItem(regionDepartments).id : null;
    const status = randomItem(queryStatuses);
    const isClosed = ['WON', 'LOST', 'CANCELLED', 'CLOSED'].includes(status);

    queryRows.push({
      id,
      refNo: `SAL-${year}-${counter}`,
      customerId: regionCustomers.length && Math.random() < 0.5 ? randomItem(regionCustomers) : null,
      customerName: faker.company.name(),
      companyName: Math.random() < 0.6 ? faker.company.name() : null,
      contactPhone: indianMobile(),
      contactEmail: Math.random() < 0.7 ? faker.internet.email().toLowerCase() : null,
      address: Math.random() < 0.5 ? faker.location.streetAddress() : null,
      gstNumber: Math.random() < 0.3 ? faker.string.alphanumeric(15).toUpperCase() : null,
      city: faker.location.city(),
      meetingType: randomItem(meetingTypes),
      visitDate: createdAt,
      visitLocation: Math.random() < 0.5 ? faker.location.streetAddress() : null,
      gpsLatitude: Math.random() < 0.3 ? faker.location.latitude({ min: 8, max: 34 }) : null,
      gpsLongitude: Math.random() < 0.3 ? faker.location.longitude({ min: 68, max: 89 }) : null,
      subject: faker.lorem.words(5),
      requirement: faker.lorem.sentences(2),
      priority: randomItem(priorities),
      productInterest: Math.random() < 0.7 ? randomItem(productInterestCodes) : null,
      quantity: Math.random() < 0.6 ? randomInt(1, 500) : null,
      budget: Math.random() < 0.5 ? randomInt(10000, 1000000) : null,
      estimatedValue: Math.random() < 0.6 ? randomInt(10000, 1500000) : null,
      expectedDeliveryDate: Math.random() < 0.5 ? laterDate(createdAt, 45) : null,
      dueDate: !isClosed && Math.random() < 0.5 ? laterDate(createdAt, 21) : null,
      tags: faker.helpers.arrayElements(allTags, randomInt(0, 3)),
      status,
      closeReason: isClosed && (status === 'LOST' || status === 'CANCELLED') ? faker.lorem.sentence() : null,
      departmentId,
      regionId: region.id,
      ownerId,
      assignedToId: departmentId && Math.random() < 0.5 ? randomUserFor(region.id) : null,
      slaDeadline: Math.random() < 0.4 ? laterDate(createdAt, 7) : null,
      slaBreached: Math.random() < 0.1,
      createdBy: ownerId,
      createdAt,
      updatedAt: laterDate(createdAt, 20),
    });
    queryRecords.push({ id, regionId: region.id, ownerId, departmentId, createdAt });
  }
  await batchCreateMany('Sales queries', queryRows, (chunk) => prisma.salesQuery.createMany({ data: chunk, skipDuplicates: true }));

  const activityActions = ['CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED'];
  const activityRows: Prisma.QueryActivityCreateManyInput[] = [];
  const commentRows: Prisma.QueryCommentCreateManyInput[] = [];
  const followUpRows2: Prisma.QueryFollowUpCreateManyInput[] = [];
  const followUpTitles = ['Follow-up call', 'Site visit', 'Product demo', 'Pricing discussion', 'Contract review', 'Delivery check-in'];
  const followUpChannels2 = ['call', 'meeting', 'email', 'whatsapp', 'on_site'];

  for (const query of queryRecords) {
    // Activities: a short, plausible timeline (1-4 entries).
    const activityCount = randomInt(1, 4);
    let activityDate = query.createdAt;
    for (let i = 0; i < activityCount; i++) {
      activityRows.push({
        queryId: query.id,
        actorId: query.ownerId,
        action: i === 0 ? 'CREATED' : randomItem(activityActions),
        remark: Math.random() < 0.3 ? faker.lorem.sentence() : null,
        createdAt: activityDate,
      });
      activityDate = laterDate(activityDate, 5);
    }

    // Comments: avg 3 per query, ~30% are replies to an earlier comment.
    const commentCount = randomInt(0, 6);
    const priorCommentIds: string[] = [];
    let commentDate = query.createdAt;
    for (let i = 0; i < commentCount; i++) {
      const commentId = randomUUID();
      commentDate = laterDate(commentDate, 4);
      commentRows.push({
        id: commentId,
        queryId: query.id,
        parentId: priorCommentIds.length && Math.random() < 0.3 ? randomItem(priorCommentIds) : null,
        body: faker.lorem.sentences(randomInt(1, 3)),
        isInternalNote: Math.random() < 0.2,
        authorId: query.ownerId,
        createdAt: commentDate,
      });
      priorCommentIds.push(commentId);
    }

    // Follow-ups ("meetings"): ~1.6 avg per query (targets ~8,000 total).
    const followUpCount = randomInt(0, 3);
    for (let i = 0; i < followUpCount; i++) {
      const scheduledAt = laterDate(query.createdAt, 45);
      const status = weightedPick<FollowUpStatus>([
        [FollowUpStatus.PENDING, 30],
        [FollowUpStatus.COMPLETED, 45],
        [FollowUpStatus.RESCHEDULED, 10],
        [FollowUpStatus.OVERDUE, 10],
        [FollowUpStatus.CANCELLED, 5],
      ]);
      followUpRows2.push({
        queryId: query.id,
        title: randomItem(followUpTitles),
        note: Math.random() < 0.5 ? faker.lorem.sentence() : null,
        scheduledAt,
        reminderMinutes: Math.random() < 0.5 ? randomItem([15, 30, 60, 1440]) : null,
        status,
        channel: randomItem(followUpChannels2),
        customerResponse: status === FollowUpStatus.COMPLETED && Math.random() < 0.5 ? faker.lorem.sentence() : null,
        outcome: status === FollowUpStatus.COMPLETED ? faker.lorem.sentence() : null,
        completedAt: status === FollowUpStatus.COMPLETED ? laterDate(scheduledAt, 1) : null,
        createdBy: query.ownerId,
        assignedToId: Math.random() < 0.6 ? randomUserFor(query.regionId) : null,
        createdAt: query.createdAt,
      });
    }
  }
  await batchCreateMany('Query activities', activityRows, (chunk) => prisma.queryActivity.createMany({ data: chunk }));
  await batchCreateMany('Query comments', commentRows, (chunk) => prisma.queryComment.createMany({ data: chunk }));
  await batchCreateMany('Query follow-ups (meetings)', followUpRows2, (chunk) => prisma.queryFollowUp.createMany({ data: chunk }));

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nBulk dataset generated in ${seconds}s: ${regions.length} regions, ${allUserIds.length + 7} users, ${departments.length} departments, ${catalogIds.length} catalog items, ${TOTAL_CUSTOMERS} customers, ${TOTAL_LEADS} leads, ${followUpRows.length} lead follow-ups, ${opportunityRows.length} opportunities, ${stageHistoryRows.length} stage history rows, ${quotationRows.length} quotations, ${quotationLineRows.length} quotation lines, ${TOTAL_QUERIES} sales queries, ${commentRows.length} query comments, ${followUpRows2.length} query follow-ups.`);
}

async function main() {
  // --- Regions -------------------------------------------------------------
  const ggn = await prisma.region.upsert({
    where: { code: 'GGN' },
    update: {},
    create: { code: 'GGN', name: 'Gurugram' },
  });
  const dl = await prisma.region.upsert({
    where: { code: 'DL' },
    update: {},
    create: { code: 'DL', name: 'Delhi' },
  });

  // --- Admin-managed picklists (Lead Source, Product Interest) -------------
  const leadSourceOptions = [
    { code: 'MANUAL', label: 'Manual', sortOrder: 1 },
    { code: 'WEB_FORM', label: 'Web form', sortOrder: 2 },
    { code: 'PHONE_IN', label: 'Phone-in', sortOrder: 3 },
    { code: 'REFERRAL', label: 'Referral', sortOrder: 4 },
    { code: 'EXISTING_CUSTOMER', label: 'Existing customer', sortOrder: 5 },
    { code: 'OTHER', label: 'Other', sortOrder: 99 },
  ];
  const productInterestOptions = [
    { code: 'CCTV_INSTALLATION', label: 'CCTV Installation', sortOrder: 1 },
    { code: 'ACCESS_CONTROL', label: 'Access Control', sortOrder: 2 },
    { code: 'AMC_RENEWAL', label: 'AMC Renewal', sortOrder: 3 },
    { code: 'OFFICE_FURNITURE', label: 'Office Furniture', sortOrder: 4 },
    { code: 'IT_HARDWARE', label: 'IT Hardware', sortOrder: 5 },
    { code: 'OTHER', label: 'Other', sortOrder: 99 },
  ];
  for (const option of leadSourceOptions) {
    await prisma.picklistOption.upsert({
      where: { listType_code: { listType: PicklistType.LEAD_SOURCE, code: option.code } },
      update: {},
      create: { listType: PicklistType.LEAD_SOURCE, ...option },
    });
  }
  for (const option of productInterestOptions) {
    await prisma.picklistOption.upsert({
      where: { listType_code: { listType: PicklistType.PRODUCT_INTEREST, code: option.code } },
      update: {},
      create: { listType: PicklistType.PRODUCT_INTEREST, ...option },
    });
  }

  // --- Role permissions (Section 3.2 matrix) --------------------------------
  for (const role of Object.values(Role)) {
    for (const permissionKey of ROLE_DEFAULT_PERMISSIONS[role] ?? []) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey } },
        update: {},
        create: { role, permissionKey },
      });
    }
  }

  // --- Users — one of each role, spread across both regions ----------------
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const superAdminHash = await argon2.hash(superAdminPassword);
  const existingSuper = await prisma.user.findUnique({ where: { email: 'superadmin@iris.local' } });
  const superAdminId = existingSuper ? existingSuper.id : await generateId('USER');
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@iris.local' },
    update: {},
    create: {
      id: superAdminId,
      name: 'Super Admin',
      email: 'superadmin@iris.local',
      passwordHash: superAdminHash,
      role: Role.SUPER_ADMIN,
      regionId: ggn.id,
    },
  });

  const ggnAdmin = await upsertUser({ name: 'Priya Regional Admin', email: 'priya.admin@iris.local', role: Role.REGIONAL_ADMIN, regionId: ggn.id });
  const ggnManager = await upsertUser({ name: 'Vikram Sales Manager', email: 'vikram.manager@iris.local', role: Role.SALES_MANAGER, regionId: ggn.id, reportingToId: ggnAdmin.id });
  const ggnExec = await upsertUser({ name: 'Rahul Sales Exec', email: 'rahul.exec@iris.local', role: Role.SALES_EXECUTIVE, regionId: ggn.id, reportingToId: ggnManager.id });
  const ggnAuditor = await upsertUser({ name: 'Anita Auditor', email: 'anita.auditor@iris.local', role: Role.AUDITOR, regionId: ggn.id });

  const dlAdmin = await upsertUser({ name: 'Sanjay Regional Admin', email: 'sanjay.admin@iris.local', role: Role.REGIONAL_ADMIN, regionId: dl.id });
  const dlExec = await upsertUser({ name: 'Neha Sales Exec', email: 'neha.exec@iris.local', role: Role.SALES_EXECUTIVE, regionId: dl.id, reportingToId: dlAdmin.id });

  // --- Catalog — sample CCTV/security product line -------------------------
  const catalogInput = [
    { code: 'CAM-2MP', name: 'IP Camera 2MP Dome', category: 'CCTV', unit: 'pcs', basePrice: 3500, taxClass: 'GST18' },
    { code: 'CAM-4MP', name: 'IP Camera 4MP Bullet', category: 'CCTV', unit: 'pcs', basePrice: 5000, taxClass: 'GST18' },
    { code: 'NVR-8CH', name: 'NVR 8 Channel', category: 'Recorder', unit: 'pcs', basePrice: 12000, taxClass: 'GST18' },
    { code: 'HDD-4TB', name: 'Surveillance HDD 4TB', category: 'Storage', unit: 'pcs', basePrice: 6500, taxClass: 'GST18' },
    { code: 'INSTALL-SVC', name: 'Installation & Commissioning', category: 'Service', unit: 'job', basePrice: 8000, taxClass: 'GST18' },
  ];
  const catalogItems: Record<string, { id: string }> = {};
  for (const item of catalogInput) {
    const existing = await prisma.catalogItem.findUnique({ where: { code: item.code } });
    const id = existing ? existing.id : await generateId('CATALOG');
    catalogItems[item.code] = await prisma.catalogItem.upsert({
      where: { code: item.code },
      update: {},
      create: { ...item, id },
    });
  }

  // --- Sample sales data (idempotent: only seed once) -----------------------
  const existingLeadCount = await prisma.lead.count({ where: { regionId: ggn.id } });
  if (existingLeadCount === 0) {
    const lead1Id = await generateId('LEAD');
    const lead1 = await prisma.lead.create({
      data: {
        id: lead1Id,
        refNo: 'GGN-L-000001',
        contactName: 'Acme Facilities Pvt Ltd',
        contactPhone: '9810000001',
        contactEmail: 'procurement@acmefacilities.example',
        source: 'WEB_FORM',
        productInterest: 'CCTV Installation',
        notes: 'Wants CCTV coverage for a 4-floor office building.',
        regionId: ggn.id,
        ownerId: ggnExec.id,
        createdBy: ggnExec.id,
      },
    });

    await prisma.leadFollowUp.create({
      data: {
        leadId: lead1.id,
        note: 'Initial call done, site visit scheduled.',
        channel: 'call',
        nextActionAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        createdBy: ggnExec.id,
      },
    });

    const opportunity1 = await prisma.$transaction(async (tx) => {
      const opp = await tx.opportunity.create({
        data: {
          leadId: lead1.id,
          dealType: DealType.INSTALLATION,
          value: 85000,
          stage: OpportunityStage.QUOTED,
          probability: STAGE_PROBABILITY.QUOTED,
          expectedClose: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          regionId: ggn.id,
          ownerId: ggnExec.id,
          createdBy: ggnExec.id,
        },
      });
      await tx.opportunityStageHistory.createMany({
        data: [
          { opportunityId: opp.id, toStage: OpportunityStage.NEW, actorId: ggnExec.id },
          { opportunityId: opp.id, fromStage: OpportunityStage.NEW, toStage: OpportunityStage.CONTACTED, actorId: ggnExec.id },
          { opportunityId: opp.id, fromStage: OpportunityStage.CONTACTED, toStage: OpportunityStage.QUOTED, actorId: ggnExec.id },
        ],
      });
      return opp;
    });

    await prisma.lead.update({ where: { id: lead1.id }, data: { status: 'QUALIFIED' } });

    await prisma.quotation.create({
      data: {
        opportunityId: opportunity1.id,
        version: 1,
        status: QuotationStatus.SENT,
        subtotal: 85000,
        discountTotal: 0,
        taxTotal: 15300,
        grandTotal: 100300,
        regionId: ggn.id,
        createdBy: ggnExec.id,
        approvedById: ggnManager.id,
        approvedAt: new Date(),
        lines: {
          create: [
            { catalogItemId: catalogItems['CAM-4MP'].id, description: 'IP Camera 4MP Bullet x8', qty: 8, unitPrice: 5000, discount: 0, tax: 7200, lineTotal: 47200 },
            { catalogItemId: catalogItems['NVR-8CH'].id, description: 'NVR 8 Channel x1', qty: 1, unitPrice: 12000, discount: 0, tax: 2160, lineTotal: 14160 },
            { catalogItemId: catalogItems['INSTALL-SVC'].id, description: 'Installation & Commissioning', qty: 1, unitPrice: 8000, discount: 0, tax: 1440, lineTotal: 9440 },
            { catalogItemId: catalogItems['HDD-4TB'].id, description: 'Surveillance HDD 4TB x2', qty: 2, unitPrice: 6500, discount: 0, tax: 2340, lineTotal: 15340 },
          ],
        },
      },
    });

    // A second, still-open lead for Delhi so both regions have data.
    const lead2Id = await generateId('LEAD');
    const lead2 = await prisma.lead.create({
      data: {
        id: lead2Id,
        refNo: 'DL-L-000001',
        contactName: 'Metro Retail Chain',
        contactPhone: '9810000002',
        source: 'REFERRAL',
        productInterest: 'AMC Renewal',
        regionId: dl.id,
        ownerId: dlExec.id,
        createdBy: dlExec.id,
      },
    });
    console.log(`Sample leads seeded: ${lead1.refNo}, ${lead2.refNo}`);
  } else {
    console.log('Sample sales data already present — skipped.');
  }

  // --- Departments + members + a sample query (Sales Query Management, Phase 1) ---
  const existingQueryCount = await prisma.salesQuery.count({ where: { regionId: ggn.id } });
  if (existingQueryCount === 0) {
    const techDept = await prisma.department.upsert({
      where: { code: 'TECH' },
      update: {},
      create: { code: 'TECH', name: 'Technical/Pre-Sales', regionId: ggn.id },
    });
    const procurementDept = await prisma.department.upsert({
      where: { code: 'PROCUREMENT' },
      update: {},
      create: { code: 'PROCUREMENT', name: 'Procurement', regionId: ggn.id },
    });
    const accountsDept = await prisma.department.upsert({
      where: { code: 'ACCOUNTS' },
      update: {},
      create: { code: 'ACCOUNTS', name: 'Accounts', regionId: null },
    });

    await prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId: techDept.id, userId: ggnManager.id } },
      update: {},
      create: { departmentId: techDept.id, userId: ggnManager.id, roleInDept: DepartmentMemberRole.MANAGER },
    });
    await prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId: techDept.id, userId: ggnExec.id } },
      update: {},
      create: { departmentId: techDept.id, userId: ggnExec.id, roleInDept: DepartmentMemberRole.EMPLOYEE },
    });

    // Sample sales query walking NEW -> ASSIGNED -> UNDER_REVIEW.
    const salesQueryRefNo = 'SAL-' + new Date().getFullYear() + '-00001';
    const salesQuery = await prisma.$transaction(async (tx) => {
      const query = await tx.salesQuery.create({
        data: {
          refNo: salesQueryRefNo,
          customerName: 'ABC Pvt Ltd',
          companyName: 'ABC Pvt Ltd',
          contactPhone: '9810000099',
          meetingType: MeetingType.WALK_IN,
          visitDate: new Date(),
          requirement: 'Need quotation for 500 office chairs, black color, delivery within 15 days.',
          priority: QueryPriority.HIGH,
          productInterest: 'Office Furniture',
          regionId: ggn.id,
          ownerId: ggnExec.id,
          createdBy: ggnExec.id,
        },
      });
      await tx.queryActivity.create({
        data: { queryId: query.id, actorId: ggnExec.id, action: 'CREATED', toStatus: SalesQueryStatus.NEW },
      });
      await tx.salesQuery.update({
        where: { id: query.id },
        data: { departmentId: techDept.id, status: SalesQueryStatus.ASSIGNED },
      });
      await tx.queryActivity.create({
        data: {
          queryId: query.id,
          actorId: ggnManager.id,
          action: 'ASSIGNED',
          remark: `Assigned to department ${techDept.name}`,
        },
      });
      const underReview = await tx.salesQuery.update({
        where: { id: query.id },
        data: { status: SalesQueryStatus.UNDER_REVIEW },
      });
      await tx.queryActivity.create({
        data: {
          queryId: query.id,
          actorId: ggnManager.id,
          action: 'STATUS_CHANGED',
          fromStatus: SalesQueryStatus.ASSIGNED,
          toStatus: SalesQueryStatus.UNDER_REVIEW,
        },
      });
      return underReview;
    });
    await prisma.queryComment.create({
      data: {
        queryId: salesQuery.id,
        body: 'Vendor quotation is under preparation.',
        authorId: ggnExec.id,
      },
    });

    console.log(`Sample sales query seeded: ${salesQuery.refNo} (${procurementDept.code}, ${accountsDept.code} depts also seeded)`);
  } else {
    console.log('Sample sales query data already present — skipped.');
  }

  // --- Large-scale randomized dataset (dashboards, pagination, reports) ----
  await seedBulkData({ ggn: { id: ggn.id, code: ggn.code }, dl: { id: dl.id, code: dl.code } });

  console.log('\nSeeded regions: GGN (Gurugram), DL (Delhi), plus 8 more (see bulk log above)');
  console.log('\nLogins (password shown once per role):');
  console.log(`  Super Admin      superadmin@iris.local     / ${superAdminPassword}`);
  console.log(`  Regional Admin   priya.admin@iris.local    / ${SAMPLE_PASSWORD}  (GGN)`);
  console.log(`  Sales Manager    vikram.manager@iris.local / ${SAMPLE_PASSWORD}  (GGN)`);
  console.log(`  Sales Executive  rahul.exec@iris.local     / ${SAMPLE_PASSWORD}  (GGN)`);
  console.log(`  Auditor          anita.auditor@iris.local  / ${SAMPLE_PASSWORD}  (GGN)`);
  console.log(`  Regional Admin   sanjay.admin@iris.local   / ${SAMPLE_PASSWORD}  (DL)`);
  console.log(`  Sales Executive  neha.exec@iris.local      / ${SAMPLE_PASSWORD}  (DL)`);
  console.log(`\n  All bulk-generated users also share the password: ${SAMPLE_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
