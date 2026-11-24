import { INestApplication } from '@nestjs/common';
import { FileStorage } from '../src/storage/file-storage';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  registerUser,
  TestUser,
} from './utils';

// PNG 1x1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('Perfil (e2e)', () => {
  let app: INestApplication;
  let user: TestUser;
  let colleague: TestUser;
  let storage: FileStorage;
  const exists = async (url: string) => {
    const file = await storage.get(`avatars/${url.split('/').pop()}`);
    file?.body.destroy();
    return !!file;
  };

  beforeAll(async () => {
    app = await createTestApp();
    storage = app.get(FileStorage);
    user = await registerUser(app, 'Nome Antigo');
    colleague = await registerUser(app, 'Colega');
    await createOrg(app, colleague, [user]);
  });

  afterAll(async () => {
    await apiAs(app, user).delete('/users/me/avatar');
    await cleanup(app);
    await app.close();
  });

  it('troca o nome', async () => {
    const res = await apiAs(app, user)
      .patch('/users/me')
      .send({ name: '  Nome Novo  ' })
      .expect(200);
    expect(res.body.name).toBe('Nome Novo');
    expect(res.body.passwordHash).toBeUndefined();

    await apiAs(app, user).patch('/users/me').send({ name: 'x' }).expect(400);
    await apiAs(app, user)
      .patch('/users/me')
      .send({ name: 'Ok', email: 'outro@e2e.taskflow.dev' })
      .expect(400);
  });

  it('envia, serve, troca e remove a foto', async () => {
    const first = await apiAs(app, user)
      .put('/users/me/avatar')
      .attach('file', PNG, { filename: 'foto.png', contentType: 'image/png' })
      .expect(200);
    const url: string = first.body.avatarUrl;
    expect(url).toMatch(/^\/api\/v1\/users\/avatars\/.+\.png$/);

    // qualquer um consegue ver a imagem (vai em <img>, sem token)
    const img = await apiAs(app).get(url.replace('/api/v1', '')).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    // os colegas recebem a nova foto nos dados da organização
    const [org] = (await apiAs(app, user).get('/organizations').expect(200))
      .body;
    const members = await apiAs(app, colleague)
      .get(`/organizations/${org.id}/members`)
      .expect(200);
    expect(members.body.find((m: any) => m.id === user.id).avatarUrl).toBe(url);

    const second = await apiAs(app, user)
      .put('/users/me/avatar')
      .attach('file', PNG, { filename: 'outra.png', contentType: 'image/png' })
      .expect(200);
    expect(second.body.avatarUrl).not.toBe(url);
    // a foto anterior é apagada
    expect(await exists(url)).toBe(false);

    const removed = await apiAs(app, user)
      .delete('/users/me/avatar')
      .expect(200);
    expect(removed.body.avatarUrl).toBeNull();
    expect(await exists(second.body.avatarUrl)).toBe(false);
  });

  it('recusa o que não é imagem, mesmo com nome e tipo de imagem', async () => {
    await apiAs(app, user)
      .put('/users/me/avatar')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'foto.png',
        contentType: 'image/png',
      })
      .expect(400);
    await apiAs(app, user).put('/users/me/avatar').expect(400);
  });

  it('recusa arquivo grande demais', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await apiAs(app, user)
      .put('/users/me/avatar')
      .attach('file', big, { filename: 'grande.png', contentType: 'image/png' })
      .expect(413);
  });

  it('não serve caminhos fora da pasta de fotos', async () => {
    await apiAs(app).get('/users/avatars/..%2F..%2Fpackage.json').expect(404);
    await apiAs(app).get('/users/avatars/nao-existe.png').expect(404);
  });
});
