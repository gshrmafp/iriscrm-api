import request from 'supertest';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded, createTestDepartment, addDepartmentMember } from '../helpers';
import { registerNotificationSubscribers } from '../../src/core/events/notificationSubscriber';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken as string;
}

describe('Sales Query — comment thread', () => {
  let regionId: string;
  let departmentId: string;
  let execToken: string;
  let execId: string;
  let deptEmployeeToken: string;
  let deptEmployeeId: string;
  let unrelatedExecToken: string;
  let superAdminToken: string;
  let managerToken: string;
  let queryId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    registerNotificationSubscribers();

    const region = await createTestRegion('SQC');
    regionId = region.id;

    const { user: exec, password: execPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'sqc-exec');
    const { user: deptEmployee, password: deptEmployeePw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'sqc-dept-emp');
    const { user: unrelatedExec, password: unrelatedExecPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'sqc-unrelated');
    const { user: manager, password: managerPw } = await createTestUser(Role.SALES_MANAGER, regionId, 'sqc-manager');
    const { user: superAdmin, password: superAdminPw } = await createTestUser(Role.SUPER_ADMIN, regionId, 'sqc-superadmin');
    execId = exec.id;
    deptEmployeeId = deptEmployee.id;
    execToken = await login(exec.email, execPw);
    deptEmployeeToken = await login(deptEmployee.email, deptEmployeePw);
    unrelatedExecToken = await login(unrelatedExec.email, unrelatedExecPw);
    superAdminToken = await login(superAdmin.email, superAdminPw);
    managerToken = await login(manager.email, managerPw);
    await prisma.user.update({ where: { id: exec.id }, data: { reportingToId: manager.id } });

    const department = await createTestDepartment(regionId, 'SQCDEPT');
    departmentId = department.id;
    await addDepartmentMember(departmentId, deptEmployee.id);

    const createRes = await request(app)
      .post('/api/v1/sales-queries')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ customerName: 'Comment Test Customer', meetingType: 'WALK_IN', requirement: 'Needs discussion' });
    queryId = createRes.body.data.id;

    const assignRes = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/assign-department`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ departmentId });
    if (assignRes.status !== 200) throw new Error(`assign-department setup failed: ${JSON.stringify(assignRes.body)}`);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [execId, deptEmployeeId] } } });
    await prisma.queryActivity.deleteMany({ where: { query: { regionId } } });
    await prisma.queryComment.deleteMany({ where: { query: { regionId } } });
    await prisma.salesQuery.deleteMany({ where: { regionId } });
    await prisma.departmentMember.deleteMany({ where: { departmentId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('creates a top-level comment and a threaded reply', async () => {
    const topLevel = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${deptEmployeeToken}`)
      .send({ body: 'Vendor quotation is under preparation.' });
    expect(topLevel.status).toBe(201);

    const reply = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Customer requested faster delivery.', parentId: topLevel.body.data.id });
    expect(reply.status).toBe(201);

    const thread = await request(app)
      .get(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`);
    expect(thread.body.data).toHaveLength(1);
    expect(thread.body.data[0].replies).toHaveLength(1);
    expect(thread.body.data[0].replies[0].body).toBe('Customer requested faster delivery.');
  });

  it('rejects the author editing their own comment — comments are a permanent audit trail', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Original text' });
    const commentId = created.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Edited text' });
    expect(editAttempt.status).toBe(403);
  });

  it('rejects a non-author, non-moderator editing someone else\'s comment', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Owner-authored comment' });
    const commentId = created.body.data.id;

    const editAttempt = await request(app)
      .patch(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${unrelatedExecToken}`)
      .send({ body: 'Trying to hijack' });
    expect(editAttempt.status).toBe(403);
  });

  it('lets a Super Admin edit any comment, sets edited flag', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Original text for admin edit' });
    const commentId = created.body.data.id;

    const edited = await request(app)
      .patch(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ body: 'Edited by admin' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.body).toBe('Edited by admin');
    expect(edited.body.data.edited).toBe(true);
  });

  it('lets a Sales Manager (holds SALES_QUERY_COMMENT_MODERATE) edit and delete someone else\'s comment', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Original text for manager moderation' });
    const commentId = created.body.data.id;

    const edited = await request(app)
      .patch(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ body: 'Edited by manager' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.body).toBe('Edited by manager');
    expect(edited.body.data.edited).toBe(true);

    const deleted = await request(app)
      .delete(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);
  });

  it('rejects the author deleting their own comment — only a moderator may delete', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Author tries to delete' });
    const commentId = created.body.data.id;

    const deleteAttempt = await request(app)
      .delete(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${execToken}`);
    expect(deleteAttempt.status).toBe(403);
  });

  it('lets a Super Admin soft-delete a comment — row retained, body redacted, thread order preserved', async () => {
    const created = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'To be deleted' });
    const commentId = created.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/sales-queries/${queryId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);
    expect(deleteRes.body.data.body).toBe('[deleted]');

    const stillThere = await prisma.queryComment.findUnique({ where: { id: commentId } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.deleted).toBe(true);
  });

  it('mentioning a department member creates a notification for them, but not for a mention of the author', async () => {
    const res = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: '@Employee please verify pricing', mentionedUserIds: [deptEmployeeId, execId] });
    expect(res.status).toBe(201);
    expect(res.body.data.mentionedUserIds).toEqual(expect.arrayContaining([deptEmployeeId]));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const notifications = await prisma.notification.findMany({ where: { userId: deptEmployeeId, type: 'QUERY_MENTIONED' } });
    expect(notifications.length).toBeGreaterThan(0);

    // Self-mention (author mentioning themselves) must not generate a notification.
    const selfNotifications = await prisma.notification.findMany({ where: { userId: execId, type: 'QUERY_MENTIONED' } });
    expect(selfNotifications).toHaveLength(0);
  });

  it('filters out a mention of a user not visible to the query (not owner, not department member)', async () => {
    const res = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/comments`)
      .set('Authorization', `Bearer ${execToken}`)
      .send({ body: 'Mentioning someone unrelated', mentionedUserIds: ['nonexistent-or-unrelated-user-id'] });
    expect(res.status).toBe(201);
    expect(res.body.data.mentionedUserIds).toEqual([]);
  });
});
