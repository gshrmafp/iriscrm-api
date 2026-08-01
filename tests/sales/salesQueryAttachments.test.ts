import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { Role } from '@prisma/client';
import { createApp } from '../../src/app';
import { prisma } from '../../src/core/db/prisma';
import { createTestRegion, createTestUser, ensureRolePermissionsSeeded } from '../helpers';
import { env } from '../../src/config/env';

const app = createApp();

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken as string;
}

describe('Sales Query — attachments', () => {
  let regionId: string;
  let execToken: string;
  let queryId: string;

  beforeAll(async () => {
    await ensureRolePermissionsSeeded();
    const region = await createTestRegion('SQA');
    regionId = region.id;
    const { user: exec, password: execPw } = await createTestUser(Role.SALES_EXECUTIVE, regionId, 'sqa-exec');
    execToken = await login(exec.email, execPw);

    const createRes = await request(app)
      .post('/api/v1/sales-queries')
      .set('Authorization', `Bearer ${execToken}`)
      .send({ customerName: 'Attachment Test Customer', meetingType: 'WALK_IN', requirement: 'Needs a quotation PDF' });
    queryId = createRes.body.data.id;
  });

  afterAll(async () => {
    const attachments = await prisma.queryAttachment.findMany({ where: { queryId } });
    for (const attachment of attachments) {
      await fs.promises.unlink(path.resolve(env.UPLOADS_DIR, attachment.storageKey)).catch(() => undefined);
    }
    await prisma.queryAttachment.deleteMany({ where: { queryId } });
    await prisma.queryActivity.deleteMany({ where: { queryId } });
    await prisma.salesQuery.deleteMany({ where: { regionId } });
    await prisma.user.deleteMany({ where: { regionId } });
    await prisma.region.deleteMany({ where: { id: regionId } });
    await prisma.$disconnect();
  });

  it('uploads a file attachment and stores it on local disk', async () => {
    const res = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/attachments`)
      .set('Authorization', `Bearer ${execToken}`)
      .attach('file', Buffer.from('%PDF-1.4 test content'), 'quotation.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data.fileName).toBe('quotation.pdf');
    expect(res.body.data.sizeBytes).toBeGreaterThan(0);

    const filePath = path.resolve(env.UPLOADS_DIR, res.body.data.storageKey);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('downloads the uploaded attachment with the correct content and headers', async () => {
    const uploadRes = await request(app)
      .post(`/api/v1/sales-queries/${queryId}/attachments`)
      .set('Authorization', `Bearer ${execToken}`)
      .attach('file', Buffer.from('hello world'), 'note.txt');
    const attachmentId = uploadRes.body.data.id;

    const downloadRes = await request(app)
      .get(`/api/v1/sales-queries/${queryId}/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${execToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toBe('hello world');
    expect(downloadRes.headers['content-disposition']).toMatch(/note\.txt/);
  });

  it('404s for an attachment that does not belong to the query', async () => {
    const res = await request(app)
      .get(`/api/v1/sales-queries/${queryId}/attachments/nonexistent-id`)
      .set('Authorization', `Bearer ${execToken}`);
    expect(res.status).toBe(404);
  });
});
