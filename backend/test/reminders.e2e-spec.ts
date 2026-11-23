import { INestApplication } from '@nestjs/common';
import { DueRemindersService } from '../src/reminders/due-reminders.service';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  eventually,
  registerUser,
  sleep,
  TestUser,
} from './utils';

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

interface Notification {
  type: string;
  payload: { taskTitle?: string; dueDate?: string; actor: unknown };
}

describe('Lembretes de prazo (e2e)', () => {
  let app: INestApplication;
  let reminders: DueRemindersService;
  let owner: TestUser;
  let member: TestUser;
  let boardId: string;
  let doneColumn: string;
  let projectId: string;

  const dueSoonFor = async (user: TestUser) =>
    (
      (await apiAs(app, user).get('/notifications').expect(200)).body
        .items as Notification[]
    ).filter((n) => n.type === 'TASK_DUE_SOON');

  const task = (body: object) =>
    apiAs(app, owner)
      .post(`/boards/${boardId}/tasks`)
      .send(body)
      .expect(201)
      .then((r) => r.body as { id: string });

  beforeAll(async () => {
    app = await createTestApp();
    reminders = app.get(DueRemindersService);
    owner = await registerUser(app, 'Dona');
    member = await registerUser(app, 'Membro');
    const org = await createOrg(app, owner, [member]);
    projectId = (
      await apiAs(app, owner)
        .post(`/organizations/${org.id}/projects`)
        .send({ name: 'Projeto' })
        .expect(201)
    ).body.id;
    const board = await apiAs(app, owner)
      .post(`/projects/${projectId}/boards`)
      .send({ name: 'Quadro' })
      .expect(201);
    boardId = board.body.id;
    doneColumn = board.body.columns[2].id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('avisa só as tarefas abertas, com responsável, que vencem em 24 h', async () => {
    const soon = await task({
      title: 'Vence amanhã',
      dueDate: inHours(20),
      assigneeIds: [member.id],
    });
    await task({
      title: 'Longe',
      dueDate: inHours(72),
      assigneeIds: [member.id],
    });
    await task({
      title: 'Já venceu',
      dueDate: inHours(-2),
      assigneeIds: [member.id],
    });
    await task({ title: 'Sem responsável', dueDate: inHours(5) });
    await task({
      title: 'Concluída',
      dueDate: inHours(5),
      columnId: doneColumn,
      assigneeIds: [member.id],
    });

    await reminders.sendDueSoon();
    const list = await eventually(
      () => dueSoonFor(member),
      (n) => n.length >= 1,
    );
    await sleep(800);
    const final = await dueSoonFor(member);
    expect(final.map((n) => n.payload.taskTitle)).toEqual(['Vence amanhã']);
    expect(list[0].payload.actor).toBeNull();
    expect(new Date(list[0].payload.dueDate!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // rodar de novo não repete o aviso
    await reminders.sendDueSoon();
    await sleep(800);
    expect(await dueSoonFor(member)).toHaveLength(1);

    // prazo novo libera um novo aviso
    await apiAs(app, owner)
      .patch(`/tasks/${soon.id}`)
      .send({ dueDate: inHours(10) })
      .expect(200);
    await reminders.sendDueSoon();
    expect(
      await eventually(
        () => dueSoonFor(member),
        (n) => n.length === 2,
      ),
    ).toHaveLength(2);
  });

  it('projeto arquivado não gera aviso', async () => {
    await task({
      title: 'Arquivada',
      dueDate: inHours(3),
      assigneeIds: [member.id],
    });
    await apiAs(app, owner)
      .patch(`/projects/${projectId}`)
      .send({ archived: true })
      .expect(200);
    const before = (await dueSoonFor(member)).length;
    await reminders.sendDueSoon();
    await sleep(800);
    expect(await dueSoonFor(member)).toHaveLength(before);
  });
});
