import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsProducer } from '../src/notifications/notifications.producer';
import { PrismaService } from '../src/prisma/prisma.service';
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

interface Notification {
  id: string;
  type: string;
  readAt: string | null;
  payload: Record<string, unknown> & { actor?: { name: string } };
}

// O worker do BullMQ grava as notificações de forma assíncrona (precisa do Redis).
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let member: TestUser;
  let other: TestUser;
  let orgName: string;
  let taskId: string;

  const list = async (user: TestUser, query = '') =>
    (await apiAs(app, user).get(`/notifications${query}`).expect(200)).body as {
      items: Notification[];
      nextCursor: string | null;
      unreadCount: number;
    };
  const waitCount = (user: TestUser, n: number) =>
    eventually(
      () => list(user),
      (r) => r.items.length >= n,
    );

  beforeAll(async () => {
    app = await createTestApp();
    [owner, member, other] = await Promise.all([
      registerUser(app, 'Dono'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Outro'),
    ]);
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('avisa quem foi adicionado à organização', async () => {
    const org = await createOrg(app, owner, [member, other]);
    orgName = org.name;
    const { items } = await waitCount(member, 1);
    expect(items[0].type).toBe('MEMBER_ADDED');
    expect(items[0].payload.organizationName).toBe(orgName);
    expect(items[0].payload.actor?.name).toBe('Dono');

    const project = await apiAs(app, owner)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: 'Proj' })
      .expect(201);
    const board = await apiAs(app, owner)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    taskId = (
      await apiAs(app, owner)
        .post(`/boards/${board.body.id}/tasks`)
        .send({ title: 'Revisar contrato', assigneeIds: [member.id, owner.id] })
        .expect(201)
    ).body.id;
  });

  it('avisa os responsáveis, mas não quem atribuiu', async () => {
    const { items } = await waitCount(member, 2);
    expect(items[0].type).toBe('TASK_ASSIGNED');
    expect(items[0].payload).toMatchObject({
      taskTitle: 'Revisar contrato',
      projectName: 'Proj',
    });
  });

  it('ao trocar responsáveis, só quem entrou é avisado', async () => {
    await apiAs(app, owner)
      .put(`/tasks/${taskId}/assignees`)
      .send({ userIds: [member.id, other.id] })
      .expect(200);
    const { items } = await waitCount(other, 2);
    expect(items[0].type).toBe('TASK_ASSIGNED');
  });

  it('comentário avisa o autor da tarefa e os responsáveis', async () => {
    await apiAs(app, member)
      .post(`/tasks/${taskId}/comments`)
      .send({ content: 'Pode deixar, olho hoje.' })
      .expect(201);
    const ownerList = await waitCount(owner, 1);
    expect(ownerList.items[0].type).toBe('TASK_COMMENTED');
    expect(ownerList.items[0].payload.excerpt).toBe('Pode deixar, olho hoje.');
    const otherList = await waitCount(other, 3);
    expect(otherList.items[0].type).toBe('TASK_COMMENTED');

    // nada além disso deve chegar
    await sleep(1500);
    const memberList = await list(member);
    expect(memberList.items.map((n) => n.type)).toEqual([
      'TASK_ASSIGNED',
      'MEMBER_ADDED',
    ]);
    expect(memberList.unreadCount).toBe(2);
    expect((await list(owner)).items).toHaveLength(1);
  });

  it('marca como lida (idempotente) e conta não lidas', async () => {
    const [first] = (await list(member)).items;
    await apiAs(app, other)
      .patch(`/notifications/${first.id}/read`)
      .expect(404);

    const read = await apiAs(app, member)
      .patch(`/notifications/${first.id}/read`)
      .expect(200);
    expect(read.body.readAt).toBeTruthy();
    const again = await apiAs(app, member)
      .patch(`/notifications/${first.id}/read`)
      .expect(200);
    expect(again.body.readAt).toBe(read.body.readAt);

    const count = await apiAs(app, member)
      .get('/notifications/unread-count')
      .expect(200);
    expect(count.body.count).toBe(1);
    expect((await list(member, '?unread=true')).items).toHaveLength(1);

    const all = await apiAs(app, member)
      .patch('/notifications/read-all')
      .expect(200);
    expect(all.body.updated).toBe(1);
    expect((await list(member)).unreadCount).toBe(0);
  });

  it('pagina e exclui', async () => {
    const p1 = await list(member, '?limit=1');
    expect(p1.items).toHaveLength(1);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await list(member, `?limit=1&cursor=${p1.nextCursor}`);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
    expect(p2.nextCursor).toBeNull();

    const id = p1.items[0].id;
    await apiAs(app, other).delete(`/notifications/${id}`).expect(404);
    await apiAs(app, member).delete(`/notifications/${id}`).expect(204);
    await apiAs(app, member).patch(`/notifications/${id}/read`).expect(404);
    await apiAs(app).get('/notifications').expect(401);
  });

  it('reenvia notificações guardadas enquanto o Redis estava fora', async () => {
    const before = (await list(other)).items.length;
    const id = randomUUID();
    await app.get(PrismaService).pendingNotification.create({
      data: {
        id,
        type: 'MEMBER_ADDED',
        actorId: owner.id,
        recipientIds: [other.id],
        data: { organizationName: 'Guardada' },
      },
    });

    expect(await app.get(NotificationsProducer).flushPending()).toBeGreaterThan(
      0,
    );
    const r = await waitCount(other, before + 1);
    expect(r.items[0].payload).toMatchObject({
      organizationName: 'Guardada',
      actor: { name: 'Dono' },
    });
    expect(
      await app.get(PrismaService).pendingNotification.count({ where: { id } }),
    ).toBe(0);
  });
});
