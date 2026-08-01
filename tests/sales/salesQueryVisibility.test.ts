import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../../src/app";
import { prisma } from "../../src/core/db/prisma";
import {
  createTestRegion,
  createTestUser,
  ensureRolePermissionsSeeded,
  createTestDepartment,
  addDepartmentMember,
} from "../helpers";

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  return res.body.data.accessToken as string;
}

async function createQuery(token: string, customerName: string) {
  const res = await request(app)
    .post("/api/v1/sales-queries")
    .set("Authorization", `Bearer ${token}`)
    .send({
      customerName,
      meetingType: "WALK_IN",
      requirement: "Test requirement",
    });
  return res.body.data.id as string;
}

describe("Sales Query — visibility (region / department / team scoping)", () => {
  let regionAId: string;
  let regionBId: string;
  let execAToken: string;
  let execBToken: string;
  let managerAToken: string;
  let otherManagerToken: string;
  let deptEmployeeToken: string;
  let unrelatedExecToken: string;
  let departmentId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();

    const regionA = await createTestRegion("SQV_A");
    const regionB = await createTestRegion("SQV_B");
    regionAId = regionA.id;
    regionBId = regionB.id;

    const { user: managerA, password: managerAPw } = await createTestUser(
      Role.SALES_MANAGER,
      regionAId,
      "sqv-mgr-a",
    );
    const { user: otherManager, password: otherManagerPw } =
      await createTestUser(Role.SALES_MANAGER, regionAId, "sqv-mgr-other");
    const { user: execA, password: execAPw } = await createTestUser(
      Role.SALES_EXECUTIVE,
      regionAId,
      "sqv-exec-a",
    );
    const { user: execB, password: execBPw } = await createTestUser(
      Role.SALES_EXECUTIVE,
      regionBId,
      "sqv-exec-b",
    );
    const { user: deptEmployee, password: deptEmployeePw } =
      await createTestUser(Role.SALES_EXECUTIVE, regionAId, "sqv-dept-emp");
    const { user: unrelatedExec, password: unrelatedExecPw } =
      await createTestUser(Role.SALES_EXECUTIVE, regionAId, "sqv-unrelated");

    await prisma.user.update({
      where: { id: execA.id },
      data: { reportingToId: managerA.id },
    });

    execAToken = await login(execA.email, execAPw);
    execBToken = await login(execB.email, execBPw);
    managerAToken = await login(managerA.email, managerAPw);
    otherManagerToken = await login(otherManager.email, otherManagerPw);
    deptEmployeeToken = await login(deptEmployee.email, deptEmployeePw);
    unrelatedExecToken = await login(unrelatedExec.email, unrelatedExecPw);

    const department = await createTestDepartment(regionAId, "SQVDEPT");
    departmentId = department.id;
    await addDepartmentMember(departmentId, deptEmployee.id);
  });

  afterAll(async () => {
    await prisma.queryActivity.deleteMany({
      where: { query: { regionId: { in: [regionAId, regionBId] } } },
    });
    await prisma.queryComment.deleteMany({
      where: { query: { regionId: { in: [regionAId, regionBId] } } },
    });
    await prisma.salesQuery.deleteMany({
      where: { regionId: { in: [regionAId, regionBId] } },
    });
    await prisma.departmentMember.deleteMany({ where: { departmentId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.user.deleteMany({
      where: { regionId: { in: [regionAId, regionBId] } },
    });
    await prisma.region.deleteMany({
      where: { id: { in: [regionAId, regionBId] } },
    });
    await prisma.$disconnect();
  });

  it("isolates queries by region — an exec in region B cannot see or list region A queries", async () => {
    const queryId = await createQuery(execAToken, "Region A Only");

    const crossRegionGet = await request(app)
      .get(`/api/v1/sales-queries/${queryId}`)
      .set("Authorization", `Bearer ${execBToken}`);
    expect(crossRegionGet.status).toBe(403);

    const listAsB = await request(app)
      .get("/api/v1/sales-queries")
      .set("Authorization", `Bearer ${execBToken}`);
    expect(
      listAsB.body.data.items.find((q: { id: string }) => q.id === queryId),
    ).toBeUndefined();
  });

  it("lets a department member see and comment on a query assigned to their department, even though they are not the owner", async () => {
    const queryId = await createQuery(execAToken, "Needs Department Review");
    await request(app)
      .post(`/api/v1/sales-queries/${queryId}/assign-department`)
      .set("Authorization", `Bearer ${managerAToken}`)
      .send({ departmentId });

    const getRes = await request(app)
      .get(`/api/v1/sales-queries/${queryId}`)
      .set("Authorization", `Bearer ${deptEmployeeToken}`);
    expect(getRes.status).toBe(200);

    const commentRes = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set("Authorization", `Bearer ${deptEmployeeToken}`)
      .send({ body: "Vendor quotation is under preparation." });
    expect(commentRes.status).toBe(201);
  });

  it("denies a Sales Executive who neither owns the query nor belongs to its department", async () => {
    const queryId = await createQuery(execAToken, "Private To Owner");
    await request(app)
      .post(`/api/v1/sales-queries/${queryId}/assign-department`)
      .set("Authorization", `Bearer ${managerAToken}`)
      .send({ departmentId });

    const getRes = await request(app)
      .get(`/api/v1/sales-queries/${queryId}`)
      .set("Authorization", `Bearer ${unrelatedExecToken}`);
    expect(getRes.status).toBe(403);

    const listRes = await request(app)
      .get("/api/v1/sales-queries")
      .set("Authorization", `Bearer ${unrelatedExecToken}`);
    expect(
      listRes.body.data.items.find((q: { id: string }) => q.id === queryId),
    ).toBeUndefined();
  });

  it("lets a Sales Manager see and act on a direct report's query, but not another manager's report's query", async () => {
    const queryId = await createQuery(execAToken, "Managed By Manager A");

    const managerAGet = await request(app)
      .get(`/api/v1/sales-queries/${queryId}`)
      .set("Authorization", `Bearer ${managerAToken}`);
    expect(managerAGet.status).toBe(200);

    const otherManagerGet = await request(app)
      .get(`/api/v1/sales-queries/${queryId}`)
      .set("Authorization", `Bearer ${otherManagerToken}`);
    expect(otherManagerGet.status).toBe(403);
  });
});
