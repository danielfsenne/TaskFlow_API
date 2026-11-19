import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

interface Task {
  id: string;
  title: string;
  columnId: string;
  completedAt: string | null;
  assignees: { id: string }[];
}

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let orgId: string;
  let boardId: string;
  let todo: string;
  let doing: string;
  let done: string;
  let otherColumn: string;
  let t1: Task;
  let t2: Task;
  let t3: Task;

  const titles = async (query = '') =>
    (
      await apiAs(app, member)
        .get(`/boards/${boardId}/tasks${query}`)
        .expect(200)
    ).body.map((t: Task) => t.title);

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

    const project = await apiAs(app, member)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Projeto' })
      .expect(201);
    const board = await apiAs(app, member)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    boardId = board.body.id;
    [todo, doing, done] = board.body.columns.map((c: { id: string }) => c.id);
    const other = await apiAs(app, member)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Outro' })
      .expect(201);
    otherColumn = other.body.columns[0].id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('cria tarefas, por padrão na primeira coluna', async () => {
    t1 = (
      await apiAs(app, member)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Tarefa 1', priority: 'HIGH', assigneeIds: [member.id] })
        .expect(201)
    ).body;
    expect(t1.columnId).toBe(todo);
    expect(t1.assignees.map((a) => a.id)).toEqual([member.id]);

    t2 = (
      await apiAs(app, admin)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Tarefa 2', dueDate: '2026-12-01T18:00:00.000Z' })
        .expect(201)
    ).body;
    t3 = (
      await apiAs(app, member)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Outra coisa', columnId: doing })
        .expect(201)
    ).body;
  });

  it('valida responsáveis, coluna e prioridade', async () => {
    const api = apiAs(app, member);
    await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'X', assigneeIds: [outsider.id] })
      .expect(400);
    await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'X', columnId: otherColumn })
      .expect(400);
    await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'X', priority: 'MAXIMA' })
      .expect(400);
  });

  it('move entre colunas e reordena', async () => {
    const api = apiAs(app, member);
    await api
      .patch(`/tasks/${t2.id}/move`)
      .send({ columnId: todo, afterTaskId: null })
      .expect(200);
    await api
      .patch(`/tasks/${t1.id}/move`)
      .send({ columnId: doing, afterTaskId: t3.id })
      .expect(200);
    expect(await titles()).toEqual(['Tarefa 2', 'Outra coisa', 'Tarefa 1']);

    await api
      .patch(`/tasks/${t1.id}/move`)
      .send({ columnId: otherColumn, afterTaskId: null })
      .expect(404);
  });

  it('filtra por responsável, texto e prioridade', async () => {
    expect(await titles(`?assigneeId=${member.id}`)).toEqual(['Tarefa 1']);
    expect(await titles('?search=tarefa')).toHaveLength(2);
    expect(await titles('?priority=HIGH')).toEqual(['Tarefa 1']);
  });

  it('edita campos e substitui responsáveis', async () => {
    const api = apiAs(app, member);
    const updated = await api
      .patch(`/tasks/${t2.id}`)
      .send({ title: 'Tarefa 2 editada', dueDate: null })
      .expect(200);
    expect(updated.body.dueDate).toBeNull();

    const two = await api
      .put(`/tasks/${t2.id}/assignees`)
      .send({ userIds: [admin.id, member.id] })
      .expect(200);
    expect(two.body.assignees).toHaveLength(2);

    const one = await api
      .put(`/tasks/${t2.id}/assignees`)
      .send({ userIds: [member.id] })
      .expect(200);
    expect(one.body.assignees.map((a: { id: string }) => a.id)).toEqual([
      member.id,
    ]);
  });

  it('a última coluna conclui a tarefa', async () => {
    const api = apiAs(app, member);
    const created = await api
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'Já pronta', columnId: done })
      .expect(201);
    expect(created.body.completedAt).not.toBeNull();

    const moved = await api
      .patch(`/tasks/${t3.id}/move`)
      .send({ columnId: done, afterTaskId: null })
      .expect(200);
    expect(moved.body.completedAt).not.toBeNull();

    const back = await api
      .patch(`/tasks/${t3.id}/move`)
      .send({ columnId: doing, afterTaskId: null })
      .expect(200);
    expect(back.body.completedAt).toBeNull();

    // coluna nova no fim muda qual é a de concluídas
    const extra = await api
      .post(`/boards/${boardId}/columns`)
      .send({ name: 'Arquivo' })
      .expect(201);
    const reopened = await api.get(`/tasks/${created.body.id}`).expect(200);
    expect(reopened.body.completedAt).toBeNull();

    await api
      .patch(`/columns/${extra.body.id}/move`)
      .send({ afterColumnId: null })
      .expect(200);
    const again = await api.get(`/tasks/${created.body.id}`).expect(200);
    expect(again.body.completedAt).not.toBeNull();

    await api.delete(`/tasks/${created.body.id}`).expect(204);
    await api.delete(`/columns/${extra.body.id}`).expect(204);
  });

  it('exclusão: autor ou quem gerencia o projeto', async () => {
    const adminProject = await apiAs(app, admin)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Do admin' })
      .expect(201);
    const adminBoard = await apiAs(app, admin)
      .post(`/projects/${adminProject.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    const adminTask = await apiAs(app, admin)
      .post(`/boards/${adminBoard.body.id}/tasks`)
      .send({ title: 'Do admin' })
      .expect(201);

    await apiAs(app, member).delete(`/tasks/${adminTask.body.id}`).expect(403);
    await apiAs(app, outsider).delete(`/tasks/${t2.id}`).expect(404);
    // t2 é do admin, mas o membro criou o projeto
    await apiAs(app, member).delete(`/tasks/${t2.id}`).expect(204);
    await apiAs(app, member).delete(`/tasks/${t3.id}`).expect(204);
  });

  it('quem sai da organização deixa de ser responsável e perde acesso', async () => {
    await apiAs(app, member)
      .delete(`/organizations/${orgId}/members/${member.id}`)
      .expect(204);
    const tasks = await apiAs(app, admin)
      .get(`/boards/${boardId}/tasks`)
      .expect(200);
    for (const t of tasks.body as Task[]) {
      expect(t.assignees.map((a) => a.id)).not.toContain(member.id);
    }
    await apiAs(app, member).get(`/boards/${boardId}`).expect(404);
  });
});
