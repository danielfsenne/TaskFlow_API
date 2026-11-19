import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

interface Column {
  id: string;
  name: string;
}

describe('Boards e colunas (e2e)', () => {
  let app: INestApplication;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let boardId: string;
  let columns: Column[];
  let other: Column[];

  const names = async () =>
    (
      await apiAs(app, member).get(`/boards/${boardId}`).expect(200)
    ).body.columns
      .map((c: Column) => c.name)
      .join('|');

  beforeAll(async () => {
    app = await createTestApp();
    const owner = await registerUser(app, 'Dono');
    member = await registerUser(app, 'Membro');
    outsider = await registerUser(app, 'Estranho');
    const org = await createOrg(app, owner, [member]);
    projectId = (
      await apiAs(app, member)
        .post(`/organizations/${org.id}/projects`)
        .send({ name: 'Projeto' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('quadro novo vem com as colunas padrão', async () => {
    const res = await apiAs(app, member)
      .post(`/projects/${projectId}/boards`)
      .send({ name: 'Sprint 1' })
      .expect(201);
    boardId = res.body.id;
    columns = res.body.columns;
    expect(columns.map((c) => c.name)).toEqual([
      'A fazer',
      'Em andamento',
      'Concluído',
    ]);
  });

  it('aceita colunas próprias', async () => {
    const res = await apiAs(app, member)
      .post(`/projects/${projectId}/boards`)
      .send({ name: 'Bugs', columns: ['Novo', 'Triado'] })
      .expect(201);
    other = res.body.columns;
    expect(other).toHaveLength(2);
  });

  it('cria, reordena e renomeia colunas', async () => {
    const api = apiAs(app, member);
    const [, doing, done] = columns;
    const review = (
      await api
        .post(`/boards/${boardId}/columns`)
        .send({ name: 'Revisão' })
        .expect(201)
    ).body;

    await api
      .patch(`/columns/${review.id}/move`)
      .send({ afterColumnId: doing.id })
      .expect(200);
    await api
      .patch(`/columns/${done.id}/move`)
      .send({ afterColumnId: null })
      .expect(200);
    expect(await names()).toBe('Concluído|A fazer|Em andamento|Revisão');

    await api
      .patch(`/columns/${done.id}/move`)
      .send({ afterColumnId: review.id })
      .expect(200);
    expect(await names()).toBe('A fazer|Em andamento|Revisão|Concluído');

    await api
      .patch(`/columns/${review.id}`)
      .send({ name: 'Code review' })
      .expect(200);
    expect(await names()).toBe('A fazer|Em andamento|Code review|Concluído');
  });

  it('rejeita movimentos inválidos', async () => {
    const api = apiAs(app, member);
    await api.patch(`/columns/${columns[2].id}/move`).send({}).expect(400);
    await api
      .patch(`/columns/${columns[2].id}/move`)
      .send({ afterColumnId: other[0].id })
      .expect(404);
  });

  it('só exclui coluna vazia', async () => {
    const api = apiAs(app, member);
    await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'T', columnId: columns[1].id })
      .expect(201);
    await api.delete(`/columns/${columns[1].id}`).expect(409);

    const empty = (
      await api
        .post(`/boards/${boardId}/columns`)
        .send({ name: 'Vazia' })
        .expect(201)
    ).body;
    await api.delete(`/columns/${empty.id}`).expect(204);
  });

  it('quem é de fora não vê o quadro', async () => {
    await apiAs(app, outsider).get(`/boards/${boardId}`).expect(404);
  });
});
