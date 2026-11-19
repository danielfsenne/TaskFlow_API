import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let ana: TestUser;
  let beto: TestUser;
  let outsider: TestUser;
  let orgId: string;
  let site: string;
  let mobile: string;

  beforeAll(async () => {
    app = await createTestApp();
    [ana, beto, outsider] = await Promise.all([
      registerUser(app, 'Ana'),
      registerUser(app, 'Beto'),
      registerUser(app, 'Estranho'),
    ]);
    orgId = (await createOrg(app, ana, [beto])).id;
    const api = apiAs(app, ana);
    site = (
      await api.post(`/organizations/${orgId}/projects`).send({ name: 'Site' })
    ).body.id;
    mobile = (
      await api.post(`/organizations/${orgId}/projects`).send({ name: 'App' })
    ).body.id;
    const b1 = (
      await api.post(`/projects/${site}/boards`).send({ name: 'Sprint 1' })
    ).body;
    const b2 = (
      await api.post(`/projects/${mobile}/boards`).send({ name: 'Backlog' })
    ).body;
    const done = b1.columns[2].id;

    const task = (boardId: string, body: object) =>
      api.post(`/boards/${boardId}/tasks`).send(body).expect(201);
    await task(b1.id, {
      title: 'Atrasada',
      dueDate: inDays(-2),
      assigneeIds: [beto.id],
      priority: 'URGENT',
    });
    await task(b1.id, {
      title: 'Vence logo',
      dueDate: inDays(2),
      assigneeIds: [beto.id],
    });
    await task(b1.id, { title: 'Sem dono', columnId: done });
    await task(b1.id, {
      title: 'Já pronta',
      columnId: done,
      assigneeIds: [ana.id],
    });
    await task(b2.id, {
      title: 'Outra do app',
      assigneeIds: [beto.id],
      priority: 'HIGH',
    });
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('indicadores da organização', async () => {
    const { body } = await apiAs(app, beto)
      .get(`/organizations/${orgId}/dashboard`)
      .expect(200);

    expect(body.totals).toEqual({
      total: 5,
      open: 3,
      completed: 2,
      overdue: 1,
      dueSoon: 1,
      unassigned: 0,
    });
    expect(
      body.breakdown.map((b: any) => [b.name, b.open, b.completed]),
    ).toEqual([
      ['App', 1, 0],
      ['Site', 2, 2],
    ]);
    expect(body.byMember[0]).toMatchObject({
      user: { id: beto.id },
      open: 3,
      overdue: 1,
    });
    expect(body.byMember[1]).toMatchObject({
      user: { id: ana.id },
      open: 0,
      completed: 1,
    });
    expect(body.byPriority.find((p: any) => p.priority === 'URGENT').open).toBe(
      1,
    );
    expect(body.weekly).toHaveLength(8);
    expect(body.weekly[7]).toMatchObject({ created: 5, completed: 2 });
  });

  it('projeto arquivado fica de fora', async () => {
    await apiAs(app, ana)
      .patch(`/projects/${mobile}`)
      .send({ archived: true })
      .expect(200);
    const { body } = await apiAs(app, ana)
      .get(`/organizations/${orgId}/dashboard`)
      .expect(200);
    expect(body.totals.total).toBe(4);
    expect(body.breakdown).toHaveLength(1);
  });

  it('indicadores do projeto, por quadro', async () => {
    const { body } = await apiAs(app, ana)
      .get(`/projects/${site}/dashboard`)
      .expect(200);
    expect(body.breakdown).toEqual([
      expect.objectContaining({ name: 'Sprint 1', total: 4 }),
    ]);
  });

  it('painel pessoal', async () => {
    const { body } = await apiAs(app, beto).get('/dashboard').expect(200);
    expect(body.totals).toEqual({
      open: 2,
      overdue: 1,
      dueSoon: 1,
      completedThisWeek: 0,
    });
    expect(body.tasks.map((t: any) => t.title)).toEqual([
      'Atrasada',
      'Vence logo',
    ]);
    expect(body.tasks[0]).toMatchObject({
      boardName: 'Sprint 1',
      columnName: 'A fazer',
      project: { name: 'Site' },
      organization: { id: orgId },
    });
    expect(body.organizations).toEqual([
      expect.objectContaining({
        id: orgId,
        members: 2,
        projects: 1,
        openTasks: 2,
      }),
    ]);

    const mine = await apiAs(app, ana).get('/dashboard').expect(200);
    expect(mine.body.totals).toMatchObject({ open: 0, completedThisWeek: 1 });
  });

  it('acesso', async () => {
    await apiAs(app, outsider)
      .get(`/organizations/${orgId}/dashboard`)
      .expect(404);
    await apiAs(app, outsider).get(`/projects/${site}/dashboard`).expect(404);
    await apiAs(app).get('/dashboard').expect(401);
    await apiAs(app, ana).get('/organizations/xyz/dashboard').expect(400);
    const empty = await apiAs(app, outsider).get('/dashboard').expect(200);
    expect(empty.body).toMatchObject({ tasks: [], organizations: [] });
  });
});
