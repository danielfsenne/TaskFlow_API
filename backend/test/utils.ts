import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/** Sobe a aplicação com a mesma configuração do main.ts. */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export const TEST_EMAIL_DOMAIN = '@e2e.taskflow.dev';

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Cria um usuário com e-mail único e devolve o access token. */
export async function registerUser(
  app: INestApplication,
  name = 'Usuário E2E',
): Promise<TestUser> {
  const email = `${randomUUID()}${TEST_EMAIL_DOMAIN}`;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name, email, password: 'SenhaForte123' })
    .expect(201);
  return { id: res.body.user.id, email, token: res.body.accessToken };
}
