import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

describe('Comments (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let taskId: string;
  let firstId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const owner = await registerUser(app, 'Dono');
    [admin, member, outsider] = await Promise.all([
      registerUser(app, 'Admin'),
      registerUser(app, 'Membro'),
      registerUser(app, 'Estranho'),
    ]);
    const org = await createOrg(app, owner, [member]);
    await apiAs(app, owner)
      .post(`/organizations/${org.id}/members`)
      .send({ email: admin.email, role: 'ADMIN' })
      .expect(201);
    const project = await apiAs(app, member)
      .post(`/organizations/${org.id}/projects`)
      .send({ name: 'Projeto' })
      .expect(201);
    const board = await apiAs(app, member)
      .post(`/projects/${project.body.id}/boards`)
      .send({ name: 'Q' })
      .expect(201);
    taskId = (
      await apiAs(app, member)
        .post(`/boards/${board.body.id}/tasks`)
        .send({ title: 'T' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('pagina por cursor, do mais antigo ao mais novo', async () => {
    const first = await apiAs(app, member)
      .post(`/tasks/${taskId}/comments`)
      .send({ content: 'Primeiro' })
      .expect(201);
    firstId = first.body.id;
    expect(first.body.author.id).toBe(member.id);
    for (let i = 2; i <= 5; i++) {
      await apiAs(app, admin)
        .post(`/tasks/${taskId}/comments`)
        .send({ content: `Comentário ${i}` })
        .expect(201);
    }

    const contents: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : '';
      const page = await apiAs(app, member)
        .get(`/tasks/${taskId}/comments?limit=2${query}`)
        .expect(200);
      contents.push(
        ...page.body.items.map((c: { content: string }) => c.content),
      );
      cursor = page.body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(contents).toEqual([
      'Primeiro',
      'Comentário 2',
      'Comentário 3',
      'Comentário 4',
      'Comentário 5',
    ]);
    await apiAs(app, member)
      .get(`/tasks/${taskId}/comments?limit=500`)
      .expect(400);
  });

  it('só o autor edita', async () => {
    await apiAs(app, admin)
      .patch(`/comments/${firstId}`)
      .send({ content: 'hack' })
      .expect(403);
    await apiAs(app, member)
      .patch(`/comments/${firstId}`)
      .send({ content: 'Primeiro (editado)' })
      .expect(200);
    const task = await apiAs(app, member).get(`/tasks/${taskId}`).expect(200);
    expect(task.body._count.comments).toBe(5);
  });

  it('ADMIN modera; quem é de fora não vê', async () => {
    await apiAs(app, admin).delete(`/comments/${firstId}`).expect(204);
    await apiAs(app, outsider).get(`/tasks/${taskId}/comments`).expect(404);
  });
});
