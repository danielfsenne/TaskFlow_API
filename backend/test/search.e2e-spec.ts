import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

describe('Busca geral (e2e)', () => {
  let app: INestApplication;
  let ana: TestUser;
  let beto: TestUser;
  // termo único por execução, para não pegar dados de outras suítes
  const term = `zeta${randomUUID().slice(0, 6)}`;

  const search = (user: TestUser, q: string) =>
    apiAs(app, user).get(`/search?q=${encodeURIComponent(q)}`);

  beforeAll(async () => {
    app = await createTestApp();
    ana = await registerUser(app, 'Ana');
    beto = await registerUser(app, 'Beto');

    const org = await createOrg(app, ana);
    const project = await apiAs(app, ana)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: `Portal ${term}`, description: 'site novo' })
      .expect(201);
    const board = await apiAs(app, ana)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: `Sprint ${term}` })
      .expect(201);
    const done = board.body.columns[2].id;
    const other = await apiAs(app, ana)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Backlog' })
      .expect(201);
    const t = (body: object) =>
      apiAs(app, ana)
        .post(`/boards/${other.body.id}/tasks`)
        .send(body)
        .expect(201);
    await t({ title: `Corrigir ${term.toUpperCase()} no login` });
    await t({ title: 'Outra coisa', description: `ver o ${term} depois` });
    await t({ title: 'Nada a ver' });
    await apiAs(app, ana)
      .post(`/boards/${board.body.id}/tasks`)
      .send({ title: `${term} entregue`, columnId: done })
      .expect(201);

    // organização do Beto, que a Ana não vê
    const betoOrg = await createOrg(app, beto);
    const betoProject = await apiAs(app, beto)
      .post(`/organizations/${betoOrg.id}/projects`)
      .send({ name: `Segredo ${term}` })
      .expect(201);
    const betoBoard = await apiAs(app, beto)
      .post(`/projects/${betoProject.body.id}/boards`)
      .send({ name: 'Quadro' })
      .expect(201);
    await apiAs(app, beto)
      .post(`/boards/${betoBoard.body.id}/tasks`)
      .send({ title: `Tarefa ${term} do Beto` })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('encontra tarefas pelo título ou descrição, sem diferenciar maiúsculas', async () => {
    const { body } = await search(ana, term).expect(200);
    const titles: string[] = body.tasks.map((t: { title: string }) => t.title);
    expect([...titles].sort()).toEqual(
      [
        `Corrigir ${term.toUpperCase()} no login`,
        'Outra coisa',
        `${term} entregue`,
      ].sort(),
    );
    // abertas antes da concluída
    expect(titles.at(-1)).toBe(`${term} entregue`);
    expect(
      body.tasks.find((t: { title: string }) => t.title === 'Outra coisa'),
    ).toMatchObject({
      boardName: 'Backlog',
      project: { name: `Portal ${term}` },
    });
  });

  it('encontra projetos e quadros', async () => {
    const { body } = await search(ana, term).expect(200);
    expect(body.projects.map((p: { name: string }) => p.name)).toEqual([
      `Portal ${term}`,
    ]);
    expect(body.boards.map((b: { name: string }) => b.name)).toEqual([
      `Sprint ${term}`,
    ]);
  });

  it('não mostra nada de organizações alheias', async () => {
    const { body } = await search(ana, `Segredo ${term}`).expect(200);
    expect(body).toEqual({ tasks: [], projects: [], boards: [] });
    const beto_ = await search(beto, term).expect(200);
    expect(beto_.body.tasks.map((t: { title: string }) => t.title)).toEqual([
      `Tarefa ${term} do Beto`,
    ]);
  });

  it('valida o termo', async () => {
    await search(ana, 'a').expect(400);
    await apiAs(app, ana).get('/search').expect(400);
    await apiAs(app).get(`/search?q=${term}`).expect(401);
  });
});
