import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  registerUser,
  TEST_EMAIL_DOMAIN,
  TestUser,
} from './utils';

describe('Organizations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let orgId: string;

  const api = (user: TestUser) => {
    const server = request(app.getHttpServer());
    const auth = (r: request.Test) =>
      r.set('Authorization', `Bearer ${user.token}`);
    return {
      get: (url: string) => auth(server.get(`/api/v1${url}`)),
      post: (url: string) => auth(server.post(`/api/v1${url}`)),
      patch: (url: string) => auth(server.patch(`/api/v1${url}`)),
      delete: (url: string) => auth(server.delete(`/api/v1${url}`)),
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [owner, admin, member, outsider] = await Promise.all([
      registerUser(app, 'Dono'),
      registerUser(app, 'Admin'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Estranho'),
    ]);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { members: { some: { userId: owner.id } } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
    });
    await app.close();
  });

  it('cria a organização com slug e o criador como OWNER', async () => {
    const res = await api(owner)
      .post('/organizations')
      .send({ name: 'Ação & Cia' })
      .expect(201);

    expect(res.body.slug).toMatch(/^acao-cia/);
    expect(res.body.role).toBe('OWNER');
    orgId = res.body.id;

    const list = await api(owner).get('/organizations').expect(200);
    expect(list.body.map((o: { id: string }) => o.id)).toContain(orgId);
  });

  it('esconde a organização de quem não é membro', async () => {
    await api(outsider).get(`/organizations/${orgId}`).expect(404);
    await api(outsider).get(`/organizations/${orgId}/members`).expect(404);
  });

  it('gerencia membros respeitando a hierarquia de papéis', async () => {
    await api(owner)
      .post(`/organizations/${orgId}/members`)
      .send({ email: admin.email, role: 'ADMIN' })
      .expect(201);

    await api(owner)
      .post(`/organizations/${orgId}/members`)
      .send({ email: admin.email })
      .expect(409);

    // ADMIN pode adicionar MEMBER, mas não outro ADMIN.
    await api(admin)
      .post(`/organizations/${orgId}/members`)
      .send({ email: member.email, role: 'ADMIN' })
      .expect(403);
    await api(admin)
      .post(`/organizations/${orgId}/members`)
      .send({ email: member.email })
      .expect(201);

    // Ninguém atribui OWNER diretamente.
    await api(owner)
      .patch(`/organizations/${orgId}/members/${member.id}`)
      .send({ role: 'OWNER' })
      .expect(400);

    // MEMBER não gerencia ninguém; ADMIN não mexe no OWNER.
    await api(member)
      .patch(`/organizations/${orgId}/members/${admin.id}`)
      .send({ role: 'MEMBER' })
      .expect(403);
    await api(admin)
      .delete(`/organizations/${orgId}/members/${owner.id}`)
      .expect(403);

    const members = await api(member)
      .get(`/organizations/${orgId}/members`)
      .expect(200);
    expect(members.body).toHaveLength(3);
    expect(members.body[0]).not.toHaveProperty('passwordHash');
  });

  it('aplica permissões de edição e exclusão', async () => {
    await api(member)
      .patch(`/organizations/${orgId}`)
      .send({ name: 'Novo nome' })
      .expect(403);
    await api(admin)
      .patch(`/organizations/${orgId}`)
      .send({ name: 'Novo nome' })
      .expect(200);
    await api(admin).delete(`/organizations/${orgId}`).expect(403);
  });

  it('permite sair da organização, exceto ao OWNER', async () => {
    await api(member)
      .delete(`/organizations/${orgId}/members/${member.id}`)
      .expect(204);
    await api(member).get(`/organizations/${orgId}`).expect(404);

    await api(owner)
      .delete(`/organizations/${orgId}/members/${owner.id}`)
      .expect(400);
  });

  it('OWNER exclui a organização', async () => {
    await api(owner).delete(`/organizations/${orgId}`).expect(204);
    await api(owner).get(`/organizations/${orgId}`).expect(404);
  });
});
