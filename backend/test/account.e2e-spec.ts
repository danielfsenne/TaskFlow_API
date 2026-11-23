import { INestApplication } from '@nestjs/common';
import {
  apiAs,
  cleanup,
  createTestApp,
  eventually,
  lastMailTo,
  registerUser,
  TestUser,
} from './utils';

describe('Conta: senha e segurança (e2e)', () => {
  let app: INestApplication;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    user = await registerUser(app, 'Rita Senha');
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('envia cabeçalhos de segurança', async () => {
    const res = await apiAs(app).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('pedido de recuperação responde igual para e-mail inexistente', async () => {
    await apiAs(app)
      .post('/auth/forgot-password')
      .send({ email: 'ninguem@e2e.taskflow.dev' })
      .expect(204);
  });

  it('recupera a senha pelo link do e-mail', async () => {
    await apiAs(app)
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect(204);

    const mail = await eventually(
      () => lastMailTo(user.email),
      (m) => m !== null,
    );
    expect(mail?.Subject).toBe('Redefinir sua senha do TaskFlow');
    const token = /reset-password\?token=([0-9a-f]{64})/.exec(mail!.Text)?.[1];
    expect(token).toBeDefined();

    const login = await apiAs(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaForte123' })
      .expect(200);

    await apiAs(app)
      .post('/auth/reset-password')
      .send({ token, password: 'SenhaNova456' })
      .expect(204);

    // o link só vale uma vez
    await apiAs(app)
      .post('/auth/reset-password')
      .send({ token, password: 'OutraSenha789' })
      .expect(400);

    // sessões antigas caem; só a senha nova entra
    await apiAs(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await apiAs(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaForte123' })
      .expect(401);
    await apiAs(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaNova456' })
      .expect(200);
  });

  it('token inválido é recusado', async () => {
    await apiAs(app)
      .post('/auth/reset-password')
      .send({ token: 'f'.repeat(64), password: 'SenhaNova456' })
      .expect(400);
    await apiAs(app)
      .post('/auth/reset-password')
      .send({ token: 'curto', password: 'SenhaNova456' })
      .expect(400);
  });

  it('troca de senha logado exige a atual e mantém a sessão atual', async () => {
    const session = await apiAs(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaNova456' })
      .expect(200);
    const other = await apiAs(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'SenhaNova456' })
      .expect(200);
    const me = { ...user, token: session.body.accessToken };

    await apiAs(app, me)
      .patch('/auth/password')
      .send({ currentPassword: 'errada', newPassword: 'SenhaFinal000' })
      .expect(400);
    const changed = await apiAs(app, me)
      .patch('/auth/password')
      .send({ currentPassword: 'SenhaNova456', newPassword: 'SenhaFinal000' })
      .expect(200);

    expect(changed.body.refreshToken).toBeDefined();
    await apiAs(app)
      .post('/auth/refresh')
      .send({ refreshToken: other.body.refreshToken })
      .expect(401);
    await apiAs(app)
      .post('/auth/refresh')
      .send({ refreshToken: changed.body.refreshToken })
      .expect(200);
    await apiAs(app).patch('/auth/password').send({}).expect(401);
  });
});
