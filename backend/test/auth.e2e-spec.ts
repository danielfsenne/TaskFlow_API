import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@taskflow.dev`;
  const password = 'SenhaForte123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('registra, autentica e rotaciona tokens', async () => {
    const register = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Teste E2E', email: email.toUpperCase(), password })
      .expect(201);

    expect(register.body.user).toMatchObject({ email });
    expect(register.body.user.passwordHash).toBeUndefined();

    await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Outro', email, password })
      .expect(409);

    await http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'senha-errada' })
      .expect(401);

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const me = await http()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // Reuso do token antigo revoga toda a sessão.
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('bloqueia rotas protegidas sem token', () => {
    return http().get('/api/v1/users/me').expect(401);
  });

  it('valida o corpo da requisição', () => {
    return http()
      .post('/api/v1/auth/register')
      .send({ name: 'X', email: 'invalido', password: '123', extra: true })
      .expect(400);
  });

  it('logout revoga o refresh token', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    await http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
