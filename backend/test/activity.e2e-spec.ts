import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

interface Activity {
  type: string;
  data: Record<string, unknown>;
  actor: { id: string; name: string };
}

describe('Histórico da tarefa (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let boardId: string;
  let columns: { id: string; name: string }[];
  let taskId: string;

  const history = async () =>
    (await apiAs(app, owner).get(`/tasks/${taskId}/activity`).expect(200))
      .body as Activity[];

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app, 'Dona');
    member = await registerUser(app, 'Beto Membro');
    outsider = await registerUser(app, 'Estranho');
    const org = await createOrg(app, owner, [member]);
    const project = await apiAs(app, owner)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: 'Projeto' })
      .expect(201);
    const board = await apiAs(app, owner)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Quadro' })
      .expect(201);
    boardId = board.body.id;
    columns = board.body.columns;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('registra criação, edições, movimento, responsáveis e etiquetas', async () => {
    taskId = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Login' })
        .expect(201)
    ).body.id;

    await apiAs(app, member)
      .patch(`/tasks/${taskId}`)
      .send({
        title: 'Login com Google',
        priority: 'HIGH',
        description: 'detalhes',
      })
      .expect(200);
    // mesmo valor de novo não gera registro
    await apiAs(app, member)
      .patch(`/tasks/${taskId}`)
      .send({ priority: 'HIGH' })
      .expect(200);

    await apiAs(app, owner)
      .patch(`/tasks/${taskId}/move`)
      .send({ columnId: columns[1].id, afterTaskId: null })
      .expect(200);
    // reordenar na mesma coluna não é movimento
    await apiAs(app, owner)
      .patch(`/tasks/${taskId}/move`)
      .send({ columnId: columns[1].id, afterTaskId: null })
      .expect(200);

    await apiAs(app, owner)
      .put(`/tasks/${taskId}/assignees`)
      .send({ userIds: [member.id] })
      .expect(200);
    await apiAs(app, owner)
      .put(`/tasks/${taskId}/assignees`)
      .send({ userIds: [owner.id] })
      .expect(200);

    const label = await apiAs(app, owner)
      .post(`/boards/${boardId}/labels`)
      .send({ name: 'bug', color: 'red' })
      .expect(201);
    await apiAs(app, owner)
      .put(`/tasks/${taskId}/labels`)
      .send({ labelIds: [label.body.id] })
      .expect(200);

    const items = await history();
    expect(items.map((a) => [a.type, a.actor.name, a.data]).reverse()).toEqual([
      ['CREATED', 'Dona', { column: 'A fazer' }],
      ['TITLE', 'Beto Membro', { from: 'Login', to: 'Login com Google' }],
      ['DESCRIPTION', 'Beto Membro', {}],
      ['PRIORITY', 'Beto Membro', { from: 'MEDIUM', to: 'HIGH' }],
      ['MOVED', 'Dona', { from: 'A fazer', to: 'Em andamento' }],
      ['ASSIGNEES', 'Dona', { added: ['Beto Membro'], removed: [] }],
      ['ASSIGNEES', 'Dona', { added: ['Dona'], removed: ['Beto Membro'] }],
      [
        'LABELS',
        'Dona',
        { added: [{ name: 'bug', color: 'red' }], removed: [] },
      ],
    ]);
  });

  it('prazo guarda antes e depois', async () => {
    await apiAs(app, owner)
      .patch(`/tasks/${taskId}`)
      .send({ dueDate: '2026-12-10T15:00:00.000Z' })
      .expect(200);
    const [last] = await history();
    expect(last).toMatchObject({
      type: 'DUE_DATE',
      data: { from: null, to: '2026-12-10T15:00:00.000Z' },
    });
  });

  it('quem é de fora não vê o histórico', async () => {
    await apiAs(app, outsider).get(`/tasks/${taskId}/activity`).expect(404);
  });
});
