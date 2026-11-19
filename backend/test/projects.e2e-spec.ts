import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let orgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    [owner, admin, member, outsider] = await Promise.all([
      registerUser(app, 'Dono'),
      registerUser(app, 'Admin'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Estranho'),
    ]);
    orgId = (await createOrg(app, owner, [member])).id;
    await apiAs(app, owner)
      .post(`/organizations/${orgId}/members`)
      .send({ email: admin.email, role: 'ADMIN' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  let mine: string;
  let adminProject: string;

  it('qualquer membro cria projeto; quem é de fora recebe 404', async () => {
    const res = await apiAs(app, member)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Projeto do membro', description: 'desc' })
      .expect(201);
    mine = res.body.id;
    expect(res.body.createdBy.id).toBe(member.id);

    adminProject = (
      await apiAs(app, admin)
        .post(`/organizations/${orgId}/projects`)
        .send({ name: 'Projeto do admin' })
        .expect(201)
    ).body.id;

    await apiAs(app, outsider)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Xis' })
      .expect(404);
  });

  it('só o criador ou ADMIN+ edita', async () => {
    await apiAs(app, member)
      .patch(`/projects/${adminProject}`)
      .send({ name: 'hack' })
      .expect(403);
    await apiAs(app, member)
      .patch(`/projects/${mine}`)
      .send({ name: 'Projeto renomeado' })
      .expect(200);
    await apiAs(app, admin)
      .patch(`/projects/${mine}`)
      .send({ description: 'pelo admin' })
      .expect(200);
  });

  it('valida o corpo', async () => {
    await apiAs(app, member)
      .patch(`/projects/${mine}`)
      .send({ name: 'a' })
      .expect(400);
    await apiAs(app, member)
      .patch(`/projects/${mine}`)
      .send({ organizationId: orgId })
      .expect(400);
  });

  it('projeto arquivado fica somente leitura', async () => {
    const board = (
      await apiAs(app, member)
        .post(`/projects/${mine}/boards`)
        .send({ name: 'Q' })
        .expect(201)
    ).body;
    const task = (
      await apiAs(app, member)
        .post(`/boards/${board.id}/tasks`)
        .send({ title: 'T' })
        .expect(201)
    ).body;

    await apiAs(app, member)
      .patch(`/projects/${mine}`)
      .send({ archived: true })
      .expect(200);

    const api = apiAs(app, member);
    await api
      .post(`/boards/${board.id}/tasks`)
      .send({ title: 'X' })
      .expect(403);
    await api
      .patch(`/tasks/${task.id}/move`)
      .send({ columnId: board.columns[1].id, afterTaskId: null })
      .expect(403);
    await api
      .post(`/tasks/${task.id}/comments`)
      .send({ content: 'X' })
      .expect(403);
    await api.patch(`/projects/${mine}`).send({ name: 'Outro' }).expect(403);
    await api.get(`/boards/${board.id}/tasks`).expect(200);

    const active = await api
      .get(`/organizations/${orgId}/projects`)
      .expect(200);
    const archived = await api
      .get(`/organizations/${orgId}/projects?archived=true`)
      .expect(200);
    expect(active.body.map((p: { id: string }) => p.id)).not.toContain(mine);
    expect(archived.body.map((p: { id: string }) => p.id)).toEqual([mine]);

    await api.patch(`/projects/${mine}`).send({ archived: false }).expect(200);
  });

  it('excluir exige ADMIN+, mesmo para o criador', async () => {
    await apiAs(app, member).delete(`/projects/${mine}`).expect(403);
    await apiAs(app, admin).delete(`/projects/${mine}`).expect(204);
    await apiAs(app, owner).get(`/projects/${mine}`).expect(404);
  });
});
