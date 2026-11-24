import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
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

type TestSocket = Socket & { received: { event: string; payload: any }[] };

// duas instâncias da API no mesmo Redis, como atrás de um balanceador
describe('Realtime com várias instâncias (e2e)', () => {
  let a: INestApplication;
  let b: INestApplication;
  let urlB: string;
  const sockets: TestSocket[] = [];
  let owner: TestUser;
  let member: TestUser;
  let orgId: string;
  let boardId: string;

  function connect(token: string): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const s = io(`${urlB}/realtime`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      }) as TestSocket;
      sockets.push(s);
      s.received = [];
      s.onAny((event, payload) => s.received.push({ event, payload }));
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  beforeAll(async () => {
    [a, b] = await Promise.all([createTestApp(), createTestApp()]);
    await b.listen(0);
    urlB = `http://localhost:${(b.getHttpServer().address() as AddressInfo).port}`;

    [owner, member] = await Promise.all([
      registerUser(a, 'Dono'),
      registerUser(a, 'Membro'),
    ]);
    orgId = (await createOrg(a, owner, [member])).id;
    const project = await apiAs(a, owner)
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'Projeto' })
      .expect(201);
    const board = await apiAs(a, owner)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    boardId = board.body.id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await cleanup(a);
    await Promise.all([a.close(), b.close()]);
  });

  it('evento gerado na instância A chega a quem está conectado na B', async () => {
    const s = await connect(member.token);
    expect(
      (await s.timeout(3000).emitWithAck('board:join', { boardId })).ok,
    ).toBe(true);

    const task = await apiAs(a, owner)
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'Entre instâncias' })
      .expect(201);

    const arrived = () =>
      s.received.some(
        (r) => r.event === 'task.created' && r.payload.task.id === task.body.id,
      );
    expect(await eventually(async () => arrived(), Boolean, 5000)).toBe(true);
  });

  it('remover o membro na A tira o socket dele da sala na B', async () => {
    const s = await connect(member.token);
    await s.timeout(3000).emitWithAck('board:join', { boardId });

    await apiAs(a, owner)
      .delete(`/organizations/${orgId}/members/${member.id}`)
      .expect((r) => expect(r.status).toBeLessThan(300));
    await sleep(300);
    s.received = [];

    await apiAs(a, owner)
      .post(`/boards/${boardId}/tasks`)
      .send({ title: 'Depois da remoção' })
      .expect(201);
    await sleep(500);
    expect(s.received.filter((r) => r.event === 'task.created')).toEqual([]);
  });
});
