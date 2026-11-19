import './throttle-env';
import { INestApplication } from '@nestjs/common';
import { apiAs, cleanup, createTestApp, registerUser } from './utils';

describe('Limite de tentativas (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('bloqueia o login depois do limite, com mensagem em português', async () => {
    const attempt = () =>
      apiAs(app)
        .post('/auth/login')
        .send({ email: 'alguem@e2e.taskflow.dev', password: 'errada1234' });

    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body.message).toBe(
      'Muitas tentativas. Aguarde um minuto e tente de novo.',
    );
  });

  it('cada rota conta separado e o refresh não é limitado', async () => {
    const user = await registerUser(app, 'Livre');
    const login = await apiAs(app)
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect(204);
    expect(login.status).toBe(204);

    const session = await apiAs(app)
      .post('/auth/register')
      .send({
        name: 'Outro',
        email: `x${Date.now()}@e2e.taskflow.dev`,
        password: 'SenhaForte123',
      })
      .expect(201);
    let refreshToken = session.body.refreshToken;
    for (let i = 0; i < 6; i++) {
      const res = await apiAs(app)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      refreshToken = res.body.refreshToken;
    }
    await apiAs(app, user).get('/users/me').expect(200);
  });
});
