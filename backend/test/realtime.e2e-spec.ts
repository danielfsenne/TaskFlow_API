import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  sleep,
  TestUser,
} from './utils';

type Received = { event: string; payload: any };
type TestSocket = Socket & { received: Received[] };

describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: TestSocket[] = [];

  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let orgId: string;
  let projectId: string;
  let boardId: string;
  let todo: string;
  let doing: string;
  let sOwner: TestSocket;
  let sMember: TestSocket;
  let sOutsider: TestSocket;
  let t1: string;

  function connect(
    token?: string,
    opts: Record<string, unknown> = {},
  ): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const s = io(`${url}/realtime`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        ...opts,
      }) as TestSocket;
      sockets.push(s);
      s.received = [];
      s.onAny((event, payload) => s.received.push({ event, payload }));
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  async function waitEvent(
    s: TestSocket,
    event: string,
    match: (p: any) => boolean = () => true,
  ) {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const hit = s.received.find((r) => r.event === event && match(r.payload));
      if (hit) return hit.payload;
      await sleep(50);
    }
    throw new Error(`evento ${event} não chegou`);
  }

  const ack = (s: TestSocket, event: string, body: unknown) =>
    s.timeout(3000).emitWithAck(event, body);

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;

    [owner, member, outsider] = await Promise.all([
      registerUser(app, 'Dono'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Estranho'),
    ]);
    orgId = (await createOrg(app, owner, [member])).id;
    const project = await apiAs(app, owner)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Projeto RT' })
      .expect(201);
    projectId = project.body.id;
    const board = await apiAs(app, owner)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    boardId = board.body.id;
    [todo, doing] = board.body.columns.map((c: { id: string }) => c.id);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await cleanup(app);
    await app.close();
  });

  it('recusa conexão sem token ou com token inválido', async () => {
    await expect(connect()).rejects.toThrow(/Não autenticado/);
    await expect(connect('lixo')).rejects.toThrow(/Não autenticado/);
  });

  it('aceita token no auth ou no header Authorization', async () => {
    sOwner = await connect(owner.token);
    sMember = await connect(member.token);
    sOutsider = await connect(undefined, {
      extraHeaders: { authorization: `Bearer ${outsider.token}` },
    });
  });

  it('só membros entram na sala do quadro', async () => {
    expect((await ack(sMember, 'board:join', { boardId })).ok).toBe(true);
    expect((await ack(sOwner, 'board:join', { boardId })).ok).toBe(true);
    expect(await ack(sOutsider, 'board:join', { boardId })).toEqual({
      ok: false,
      error: 'Quadro não encontrado',
    });
    expect(
      (await ack(sMember, 'board:join', { boardId: 'nao-e-uuid' })).ok,
    ).toBe(false);
  });

  it('propaga eventos de tarefa com quem fez a alteração', async () => {
    t1 = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'T1' })
        .expect(201)
    ).body.id;
    const created = await waitEvent(
      sMember,
      'task.created',
      (p) => p.task.id === t1,
    );
    expect(created).toMatchObject({ actorId: owner.id, task: { title: 'T1' } });
    expect((await waitEvent(sOwner, 'task.created')).actorId).toBe(owner.id);

    const t2 = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'T2' })
        .expect(201)
    ).body.id;
    await apiAs(app, owner)
      .patch(`/tasks/${t2}/move`)
      .send({ columnId: doing, afterTaskId: null })
      .expect(200);
    const moved = await waitEvent(
      sMember,
      'task.moved',
      (p) => p.task.id === t2,
    );
    expect(moved.fromColumnId).toBe(todo);
    expect(moved.task.columnId).toBe(doing);
    expect(moved.positions[0].id).toBe(t2);

    await apiAs(app, member)
      .patch(`/tasks/${t1}`)
      .send({ priority: 'URGENT' })
      .expect(200);
    const updated = await waitEvent(
      sOwner,
      'task.updated',
      (p) => p.task.id === t1,
    );
    expect(updated).toMatchObject({
      actorId: member.id,
      task: { priority: 'URGENT' },
    });
  });

  it('propaga comentários, colunas e o quadro', async () => {
    const comment = (
      await apiAs(app, member)
        .post(`/tasks/${t1}/comments`)
        .send({ content: 'oi' })
        .expect(201)
    ).body;
    const created = await waitEvent(
      sOwner,
      'comment.created',
      (p) => p.comment.id === comment.id,
    );
    expect(created.taskId).toBe(t1);
    await apiAs(app, member).delete(`/comments/${comment.id}`).expect(204);
    expect(
      (
        await waitEvent(
          sOwner,
          'comment.deleted',
          (p) => p.commentId === comment.id,
        )
      ).taskId,
    ).toBe(t1);

    const col = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/columns`)
        .send({ name: 'Revisão' })
        .expect(201)
    ).body;
    expect((await waitEvent(sMember, 'column.created')).column.id).toBe(col.id);
    await apiAs(app, owner)
      .patch(`/columns/${col.id}/move`)
      .send({ afterColumnId: null })
      .expect(200);
    const colMoved = await waitEvent(sMember, 'column.moved');
    expect(colMoved.columnId).toBe(col.id);
    expect(colMoved.positions.length).toBeGreaterThanOrEqual(1);
    await apiAs(app, owner).delete(`/columns/${col.id}`).expect(204);
    expect((await waitEvent(sMember, 'column.deleted')).columnId).toBe(col.id);

    await apiAs(app, owner)
      .patch(`/boards/${boardId}`)
      .send({ name: 'Q2' })
      .expect(200);
    expect((await waitEvent(sMember, 'board.updated')).board.name).toBe('Q2');
  });

  it('entrega notificações só ao destinatário', async () => {
    const task = (
      await apiAs(app, owner)
        .post(`/boards/${boardId}/tasks`)
        .send({ title: 'Pra você', assigneeIds: [member.id] })
        .expect(201)
    ).body;
    const ev = await waitEvent(
      sMember,
      'notification.created',
      (p) => p.notification.type === 'TASK_ASSIGNED',
    );
    expect(ev.notification.payload).toMatchObject({
      taskId: task.id,
      actor: { id: owner.id },
    });
    const ownerTypes = sOwner.received
      .filter((r) => r.event === 'notification.created')
      .map((r) => r.payload.notification.type);
    expect(ownerTypes).toEqual(['TASK_COMMENTED']);
    expect(sOutsider.received).toHaveLength(0);
  });

  it('ex-membro e quem saiu da sala param de receber', async () => {
    await ack(sOwner, 'board:leave', { boardId });
    await apiAs(app, owner)
      .delete(`/organizations/${orgId}/members/${member.id}`)
      .expect(204);
    await sleep(200);
    const memberBefore = sMember.received.length;
    const ownerBefore = sOwner.received.length;

    await apiAs(app, owner)
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'Secreta' })
      .expect(201);
    await sleep(1000);

    const leaked = sMember.received
      .slice(memberBefore)
      .filter((r) => r.event.startsWith('task.'));
    expect(leaked).toHaveLength(0);
    expect(sOwner.received.slice(ownerBefore)).toHaveLength(0);
    expect((await ack(sMember, 'board:join', { boardId })).ok).toBe(false);
  });

  it('avisa quando o quadro é excluído', async () => {
    await ack(sOwner, 'board:join', { boardId });
    await apiAs(app, owner).delete(`/boards/${boardId}`).expect(204);
    expect((await waitEvent(sOwner, 'board.deleted')).boardId).toBe(boardId);
  });

  it('etiquetas, arquivamento e exclusão do projeto chegam aos quadros abertos', async () => {
    const board = await apiAs(app, owner)
      .post(`/projects/${projectId}/boards`)
      .send({ name: 'Outro' })
      .expect(201);
    expect(
      (await ack(sOwner, 'board:join', { boardId: board.body.id })).ok,
    ).toBe(true);

    // etiqueta é do projeto: criada pelo outro quadro, chega neste também
    const sibling = await apiAs(app, owner)
      .post(`/projects/${projectId}/boards`)
      .send({ name: 'Irmão' })
      .expect(201);
    const label = await apiAs(app, owner)
      .post(`/boards/${sibling.body.id}/labels`)
      .send({ name: 'compartilhada', color: 'green' })
      .expect(201);
    expect(
      (
        await waitEvent(
          sOwner,
          'label.created',
          (p) => p.label.id === label.body.id,
        )
      ).label.name,
    ).toBe('compartilhada');

    await apiAs(app, owner)
      .patch(`/projects/${projectId}`)
      .send({ archived: true })
      .expect(200);
    const updated = await waitEvent(sOwner, 'project.updated');
    expect(updated).toMatchObject({
      actorId: owner.id,
      project: { id: projectId, archived: true },
    });

    await apiAs(app, owner).delete(`/projects/${projectId}`).expect(204);
    expect(await waitEvent(sOwner, 'project.deleted')).toMatchObject({
      projectId,
      organizationId: orgId,
    });
  });
});
