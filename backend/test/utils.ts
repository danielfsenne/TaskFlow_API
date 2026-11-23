import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/app.setup';

// mesma configuração do main.ts (app.setup)
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export const TEST_EMAIL_DOMAIN = '@e2e.taskflow.dev';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
}

export async function registerUser(
  app: INestApplication,
  name = 'Usuário E2E',
): Promise<TestUser> {
  const email = `${randomUUID()}${TEST_EMAIL_DOMAIN}`;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name, email, password: 'SenhaForte123' })
    .expect(201);
  return { id: res.body.user.id, name, email, token: res.body.accessToken };
}

export function apiAs(app: INestApplication, user?: TestUser) {
  const server = () => request(app.getHttpServer());
  const auth = (r: request.Test) =>
    user ? r.set('Authorization', `Bearer ${user.token}`) : r;
  return {
    get: (url: string) => auth(server().get(`/api/v1${url}`)),
    post: (url: string) => auth(server().post(`/api/v1${url}`)),
    put: (url: string) => auth(server().put(`/api/v1${url}`)),
    patch: (url: string) => auth(server().patch(`/api/v1${url}`)),
    delete: (url: string) => auth(server().delete(`/api/v1${url}`)),
  };
}

// organização do `owner` com os demais como membros
export async function createOrg(
  app: INestApplication,
  owner: TestUser,
  members: TestUser[] = [],
) {
  const org = await apiAs(app, owner)
    .post('/organizations')
    .send({ name: `Org ${randomUUID().slice(0, 8)}` })
    .expect(201);
  for (const m of members) {
    await apiAs(app, owner)
      .post(`/organizations/${org.body.id}/members`)
      .send({ email: m.email })
      .expect(201);
  }
  return org.body as { id: string; name: string };
}

export async function cleanup(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const users = { email: { endsWith: TEST_EMAIL_DOMAIN } };
  await prisma.organization.deleteMany({
    where: { members: { some: { user: users } } },
  });
  await prisma.user.deleteMany({ where: users });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function eventually<T>(
  fn: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  let value = await fn();
  while (!ok(value) && Date.now() < end) {
    await sleep(150);
    value = await fn();
  }
  return value;
}

// precisa do Mailpit do docker compose (SMTP 1025, API 8025)
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export async function lastMailTo(email: string) {
  const res = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  const { messages } = (await res.json()) as { messages: { ID: string }[] };
  if (!messages?.length) return null;
  const msg = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`);
  return (await msg.json()) as { Subject: string; Text: string };
}
