import { INestApplication } from '@nestjs/common';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { FileStorage } from '../src/storage/file-storage';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Anexos (e2e)', () => {
  let app: INestApplication;
  let service: AttachmentsService;
  let storage: FileStorage;
  const exists = async (key: string) => {
    const file = await storage.get(key);
    file?.body.destroy();
    return !!file;
  };
  let owner: TestUser;
  let member: TestUser;
  let other: TestUser;
  let outsider: TestUser;
  let boardId: string;
  let taskId: string;
  let pdfId: string;
  let imageId: string;

  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    app = await createTestApp();
    service = app.get(AttachmentsService);
    storage = app.get(FileStorage);
    [owner, member, other, outsider] = await Promise.all([
      registerUser(app, 'Dona'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Outro'),
      registerUser(app, 'Estranho'),
    ]);
    const org = await createOrg(app, owner, [member, other]);
    const project = await apiAs(app, owner)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: 'Projeto' })
      .expect(201);
    boardId = (
      await apiAs(app, owner)
        .post(`/projects/${project.body.id}/boards`)
        .send({ name: 'Quadro' })
        .expect(201)
    ).body.id;
    taskId = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Com anexos' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('anexa arquivos, com nome acentuado, e lista na ordem', async () => {
    const pdf = await apiAs(app, member)
      .post(`/tasks/${taskId}/attachments`)
      .attach('file', Buffer.from('%PDF-1.4 conteúdo'), {
        filename: 'relatório final.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    pdfId = pdf.body.id;
    expect(pdf.body).toMatchObject({
      fileName: 'relatório final.pdf',
      mimeType: 'application/pdf',
      size: Buffer.byteLength('%PDF-1.4 conteúdo'),
      uploadedBy: { id: member.id },
    });

    imageId = (
      await apiAs(app, owner)
        .post(`/tasks/${taskId}/attachments`)
        .attach('file', PNG, { filename: 'tela.png', contentType: 'image/png' })
        .expect(201)
    ).body.id;

    const list = await apiAs(app, member)
      .get(`/tasks/${taskId}/attachments`)
      .expect(200);
    expect(list.body.map((a: { fileName: string }) => a.fileName)).toEqual([
      'relatório final.pdf',
      'tela.png',
    ]);
    const task = await apiAs(app, member).get(`/tasks/${taskId}`).expect(200);
    expect(task.body._count.attachments).toBe(2);
  });

  it('imagem abre no navegador; o resto sempre baixa, isolado', async () => {
    const img = await apiAs(app, member)
      .get(`/attachments/${imageId}/file`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['content-disposition']).toMatch(/^inline/);
    expect(Buffer.compare(img.body, PNG)).toBe(0);

    const pdf = await apiAs(app, member)
      .get(`/attachments/${pdfId}/file`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/octet-stream');
    expect(pdf.headers['content-disposition']).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent('relatório final.pdf')}`,
    );
    expect(pdf.headers['content-security-policy']).toContain('sandbox');
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');
  });

  it('HTML enviado como imagem não é servido como página', async () => {
    const html = await apiAs(app, member)
      .post(`/tasks/${taskId}/attachments`)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      })
      .expect(201);
    const res = await apiAs(app, member)
      .get(`/attachments/${html.body.id}/file`)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    await apiAs(app, member).delete(`/attachments/${html.body.id}`).expect(204);
  });

  it('sem login ou de fora da organização não acessa', async () => {
    await apiAs(app).get(`/attachments/${pdfId}/file`).expect(401);
    await apiAs(app, outsider).get(`/attachments/${pdfId}/file`).expect(404);
    await apiAs(app, outsider).get(`/tasks/${taskId}/attachments`).expect(404);
  });

  it('só quem enviou ou o gerente do projeto exclui', async () => {
    await apiAs(app, other).delete(`/attachments/${pdfId}`).expect(403);
    const stored = await app
      .get(PrismaService)
      .attachment.findUniqueOrThrow({ where: { id: pdfId } });
    await apiAs(app, member).delete(`/attachments/${pdfId}`).expect(204);
    expect(await exists(`attachments/${stored.storedName}`)).toBe(false);
    // a dona do projeto modera
    await apiAs(app, owner).delete(`/attachments/${imageId}`).expect(204);

    const history = await apiAs(app, owner)
      .get(`/tasks/${taskId}/activity`)
      .expect(200);
    const types = history.body.map((a: { type: string }) => a.type);
    expect(types.filter((t: string) => t === 'ATTACHMENT_ADDED')).toHaveLength(
      3,
    );
    expect(
      types.filter((t: string) => t === 'ATTACHMENT_REMOVED'),
    ).toHaveLength(3);
  });

  it('recusa arquivo grande demais ou sem arquivo', async () => {
    await apiAs(app, member)
      .post(`/tasks/${taskId}/attachments`)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'grande.bin')
      .expect(413);
    await apiAs(app, member).post(`/tasks/${taskId}/attachments`).expect(400);
  });

  it('limpeza remove arquivos sem registro, mas não os recentes', async () => {
    const kept = await apiAs(app, member)
      .post(`/tasks/${taskId}/attachments`)
      .attach('file', Buffer.from('fica'), 'fica.txt')
      .expect(201);
    const { storedName } = await app
      .get(PrismaService)
      .attachment.findUniqueOrThrow({ where: { id: kept.body.id } });
    await storage.put('attachments/orfao.bin', Buffer.from('x'), 'text/plain');

    await service.sweepOrphans();
    expect(await exists('attachments/orfao.bin')).toBe(true);

    const inTwoHours = Date.now() + 2 * 60 * 60 * 1000;
    expect(await service.sweepOrphans(inTwoHours)).toBeGreaterThanOrEqual(1);
    expect(await exists('attachments/orfao.bin')).toBe(false);
    expect(await exists(`attachments/${storedName}`)).toBe(true);
  });
});
