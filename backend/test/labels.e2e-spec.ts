import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

describe('Etiquetas (e2e)', () => {
  let app: INestApplication;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let boardId: string;
  let otherBoardId: string;
  let otherProjectBoardId: string;
  let bug: { id: string };
  let design: { id: string };
  let taskId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const owner = await registerUser(app, 'Dona');
    member = await registerUser(app, 'Membro');
    outsider = await registerUser(app, 'Estranho');
    const org = await createOrg(app, owner, [member]);
    projectId = (
      await apiAs(app, member)
        .post(`/organizations/${org.id}/projects`)
        .send({ name: 'Projeto' })
        .expect(201)
    ).body.id;
    boardId = (
      await apiAs(app, member)
        .post(`/projects/${projectId}/boards`)
        .send({ name: 'Quadro' })
        .expect(201)
    ).body.id;
    otherBoardId = (
      await apiAs(app, member)
        .post(`/projects/${projectId}/boards`)
        .send({ name: 'Outro' })
        .expect(201)
    ).body.id;
    const otherProject = await apiAs(app, member)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: 'Outro projeto' })
      .expect(201);
    otherProjectBoardId = (
      await apiAs(app, member)
        .post(`/projects/${otherProject.body.id}/boards`)
        .send({ name: 'Quadro' })
        .expect(201)
    ).body.id;
    taskId = (
      await apiAs(app, member)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Corrigir login' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('cria etiquetas com cor da paleta e nome único no projeto', async () => {
    const api = apiAs(app, member);
    bug = (
      await api
        .post(`/boards/${boardId}/labels`)
        .send({ name: ' bug ', color: 'red' })
        .expect(201)
    ).body;
    expect(bug).toMatchObject({ name: 'bug', color: 'red' });
    design = (
      await api
        .post(`/boards/${boardId}/labels`)
        .send({ name: 'design', color: 'purple' })
        .expect(201)
    ).body;

    await api
      .post(`/boards/${boardId}/labels`)
      .send({ name: 'bug', color: 'blue' })
      .expect(409);
    await api
      .post(`/boards/${boardId}/labels`)
      .send({ name: 'x', color: '#ff0000' })
      .expect(400);
    // os quadros do projeto compartilham as etiquetas
    await api
      .post(`/boards/${otherBoardId}/labels`)
      .send({ name: 'bug', color: 'red' })
      .expect(409);
    // outro projeto tem as suas
    await api
      .post(`/boards/${otherProjectBoardId}/labels`)
      .send({ name: 'bug', color: 'red' })
      .expect(201);

    for (const id of [boardId, otherBoardId]) {
      const board = await api.get(`/boards/${id}`).expect(200);
      expect(board.body.labels.map((l: { name: string }) => l.name)).toEqual([
        'bug',
        'design',
      ]);
    }
  });

  it('aplica etiquetas na tarefa e filtra por elas', async () => {
    const api = apiAs(app, member);
    const task = await api
      .put(`/tasks/${taskId}/labels`)
      .send({ labelIds: [design.id, bug.id] })
      .expect(200);
    expect(task.body.labels.map((l: { name: string }) => l.name)).toEqual([
      'bug',
      'design',
    ]);

    await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'Sem etiqueta' })
      .expect(201);
    const filtered = await api
      .get(`/boards/${boardId}/tasks?labelId=${bug.id}`)
      .expect(200);
    expect(filtered.body.map((t: { title: string }) => t.title)).toEqual([
      'Corrigir login',
    ]);
  });

  it('vale em qualquer quadro do projeto, mas não em outro projeto', async () => {
    const otherTask = await apiAs(app, member)
      .post(`/boards/${otherBoardId}/tasks`)
      .send({ title: 'No outro quadro' })
      .expect(201);
    await apiAs(app, member)
      .put(`/tasks/${otherTask.body.id}/labels`)
      .send({ labelIds: [bug.id] })
      .expect(200);

    const other = await apiAs(app, member)
      .get(`/boards/${otherProjectBoardId}/labels`)
      .expect(200);
    await apiAs(app, member)
      .put(`/tasks/${taskId}/labels`)
      .send({ labelIds: [other.body[0].id] })
      .expect(400);
  });

  it('renomeia e troca a cor; a tarefa acompanha', async () => {
    await apiAs(app, member)
      .patch(`/labels/${bug.id}`)
      .send({ name: 'defeito', color: 'orange' })
      .expect(200);
    const task = await apiAs(app, member).get(`/tasks/${taskId}`).expect(200);
    expect(task.body.labels[0]).toMatchObject({
      name: 'defeito',
      color: 'orange',
    });
  });

  it('excluir a etiqueta a tira das tarefas', async () => {
    await apiAs(app, member).delete(`/labels/${design.id}`).expect(204);
    const task = await apiAs(app, member).get(`/tasks/${taskId}`).expect(200);
    expect(task.body.labels.map((l: { name: string }) => l.name)).toEqual([
      'defeito',
    ]);
  });

  it('quem é de fora não vê nem mexe', async () => {
    await apiAs(app, outsider).get(`/boards/${boardId}/labels`).expect(404);
    await apiAs(app, outsider)
      .post(`/boards/${boardId}/labels`)
      .send({ name: 'hack', color: 'red' })
      .expect(404);
    await apiAs(app, outsider).delete(`/labels/${bug.id}`).expect(404);
  });

  it('projeto arquivado não aceita mudanças nas etiquetas', async () => {
    await apiAs(app, member)
      .patch(`/projects/${projectId}`)
      .send({ archived: true })
      .expect(200);
    await apiAs(app, member)
      .post(`/boards/${boardId}/labels`)
      .send({ name: 'nova', color: 'green' })
      .expect(403);
    await apiAs(app, member)
      .put(`/tasks/${taskId}/labels`)
      .send({ labelIds: [] })
      .expect(403);
    await apiAs(app, member).get(`/boards/${boardId}/labels`).expect(200);
  });
});
