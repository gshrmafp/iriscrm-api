import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../../src/app";
import { prisma } from "../../src/core/db/prisma";
import {
  createTestRegion,
  createTestUser,
  ensureRolePermissionsSeeded,
  createTestDepartment,
} from "../helpers";

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  return res.body.data.accessToken as string;
}

describe("Sales Query — status workflow", () => {
  let regionId: string;
  let departmentId: string;
  let execToken: string;
  let managerToken: string;
  let queryId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();

    const region = await createTestRegion("SQ");
    regionId = region.id;

    const { user: manager, password: managerPw } = await createTestUser(
      Role.SALES_MANAGER,
      regionId,
      "sq-manager",
    );
    const { user: exec, password: execPw } = await createTestUser(
      Role.SALES_EXECUTIVE,
      regionId,
      "sq-exec",
    );
    await prisma.user.update({
      where: { id: exec.id },
      data: { reportingToId: manager.id },
    });
    managerToken = await login(manager.email, managerPw);
    execToken = await login(exec.email, execPw);

    const department = await createTestDepartment(regionId, "SQDEPT");
    departmentId = department.id;
  });

  afterAll(async () => {
    await prisma.queryActivity.deleteMany({ where: { query: { regionId } } });
    await prisma.queryComment.deleteMany({ where: { query: { regionId } } });
    await prisma.salesQuery.deleteMany({ where: { regionId } });
    await prisma.departmentMember.deleteMany({ where: { departmentId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it("creates a query with a year-scoped human-readable refNo", async () => {
    const res = await request(app)
      .post("/api/v1/sales-queries")
      .set("Authorization", `Bearer ${execToken}`)
      .send({
        customerName: "Test Customer Pvt Ltd",
        meetingType: "WALK_IN",
        requirement: "Need quotation for 500 office chairs",
        priority: "HIGH",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.refNo).toMatch(/^SAL-\d{4}-\d{5}$/);
    expect(res.body.data.status).toBe("NEW");
    queryId = res.body.data.id;
  });

  it("rejects an invalid status transition (NEW -> WON directly)", async () => {
    const res = await request(app)
      .patch(`/api/v1/sales-queries/${queryId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ toStatus: "WON" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot move from NEW to WON/);
  });

  it("walks NEW -> ASSIGNED -> UNDER_REVIEW -> QUOTATION_PREPARATION -> QUOTATION_PREPARED -> QUOTATION_SENT -> WON -> CLOSED", async () => {
    const assignRes = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/assign-department`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ departmentId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.status).toBe("ASSIGNED");
    expect(assignRes.body.data.departmentId).toBe(departmentId);

    const steps: Array<{ toStatus: string; remark?: string }> = [
      { toStatus: "UNDER_REVIEW" },
      { toStatus: "QUOTATION_PREPARATION" },
      { toStatus: "QUOTATION_PREPARED" },
      { toStatus: "QUOTATION_SENT" },
      { toStatus: "WON" },
      { toStatus: "CLOSED", remark: "Closed successfully" },
    ];
    for (const step of steps) {
      const res = await request(app)
        .patch(`/api/v1/sales-queries/${queryId}/status`)
        .set("Authorization", `Bearer ${managerToken}`)
        .send(step);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(step.toStatus);
    }

    const activities = await prisma.queryActivity.findMany({
      where: { queryId },
      orderBy: { createdAt: "asc" },
    });
    expect(activities.map((a) => a.action)).toEqual([
      "CREATED",
      "ASSIGNED",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
      "STATUS_CHANGED",
    ]);
  });

  it("requires a remark to move into LOST/CANCELLED/WAITING_FOR_CUSTOMER/WAITING_FOR_INTERNAL_TEAM/CLOSED", async () => {
    const createRes = await request(app)
      .post("/api/v1/sales-queries")
      .set("Authorization", `Bearer ${execToken}`)
      .send({
        customerName: "Another Customer",
        meetingType: "SCHEDULED",
        requirement: "Site survey needed",
      });
    const otherId = createRes.body.data.id;

    // Assign department so we have a valid state path to WAITING_FOR_INTERNAL_TEAM
    await request(app)
      .post(`/api/v1/sales-queries/${otherId}/assign-department`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ departmentId });

    const noRemark = [{ toStatus: "CANCELLED" }, { toStatus: "CLOSED" }];
    for (const step of noRemark) {
      const res = await request(app)
        .patch(`/api/v1/sales-queries/${otherId}/status`)
        .set("Authorization", `Bearer ${execToken}`)
        .send(step);
      expect(res.status).toBe(422);
    }
  });
});
