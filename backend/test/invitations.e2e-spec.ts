import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  apiAs,
  cleanup,
  createOrg,
  createTestApp,
  eventually,
  lastMailTo,
  registerUser,
  TEST_EMAIL_DOMAIN,
  TestUser,
} from './utils';

describe('Convites por e-mail (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let orgId: string;
  let orgName: string;
  const guestEmail = `convidada-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
  let token: string;

  const tokenFromMail = async (email: string) => {
    const mail = await eventually(
      () => lastMailTo(email),
      (m) => m !== null,
    );
    return { mail, token: /invite\?token=([0-9a-f]{64})/.exec(mail!.Text)![1] };
  };

  beforeAll(async () => {
    app = await createTestApp();
    [owner, admin, member] = await Promise.all([
      registerUser(app, 'Dona'),
      registerUser(app, 'Admin'),
      registerUser(app, 'Membro'),
    ]);
    const org = await createOrg(app, owner, [member]);
    orgId = org.id;
    orgName = org.name;
    await apiAs(app, owner)
      .post(`/organizations/${orgId}/members`)
      .send({ email: admin.email, role: 'ADMIN' })
      .expect(201);
  });

  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('adicionar alguém sem conta responde 404 com a mensagem certa', async () => {
    const res = await apiAs(app, owner)
      .post(`/organizations/${orgId}/members`)
      .send({ email: guestEmail })
      .expect(404);
    expect(res.body.message).toBe(
      'Ninguém com esse e-mail tem conta no TaskFlow',
    );
  });

  it('só ADMIN+ convida, e só papéis abaixo do seu', async () => {
    await apiAs(app, member)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email: guestEmail })
      .expect(403);
    await apiAs(app, admin)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email: guestEmail, role: 'ADMIN' })
      .expect(403);
    await apiAs(app, owner)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email: member.email })
      .expect(409);
  });

  it('envia o e-mail e lista o convite pendente', async () => {
    const res = await apiAs(app, admin)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email: guestEmail.toUpperCase() })
      .expect(201);
    expect(res.body).toMatchObject({
      email: guestEmail,
      role: 'MEMBER',
      invitedBy: { id: admin.id },
    });

    const sent = await tokenFromMail(guestEmail);
    token = sent.token;
    expect(sent.mail!.Subject).toBe(
      `Admin convidou você para ${orgName} no TaskFlow`,
    );

    const list = await apiAs(app, admin)
      .get(`/organizations/${orgId}/invitations`)
      .expect(200);
    expect(list.body.map((i: { email: string }) => i.email)).toEqual([
      guestEmail,
    ]);
    await apiAs(app, member)
      .get(`/organizations/${orgId}/invitations`)
      .expect(403);
  });

  it('a tela do link mostra o convite sem precisar de login', async () => {
    const res = await apiAs(app).get(`/invitations/token/${token}`).expect(200);
    expect(res.body).toEqual({
      email: guestEmail,
      role: 'MEMBER',
      organization: { id: orgId, name: orgName },
      invitedBy: { id: admin.id, name: 'Admin' },
      expired: false,
    });
    await apiAs(app).get('/invitations/token/abc').expect(400);
    await apiAs(app)
      .get(`/invitations/token/${'0'.repeat(64)}`)
      .expect(404);
  });

  it('só a conta do e-mail convidado aceita', async () => {
    const stranger = await registerUser(app, 'Outra Pessoa');
    const res = await apiAs(app, stranger)
      .post(`/invitations/token/${token}/accept`)
      .expect(403);
    expect(res.body.message).toContain(guestEmail);
    await apiAs(app).post(`/invitations/token/${token}/accept`).expect(401);
  });

  it('a convidada cria a conta, aceita e vira membro', async () => {
    const signup = await apiAs(app)
      .post('/auth/register')
      .send({ name: 'Convidada', email: guestEmail, password: 'SenhaForte123' })
      .expect(201);
    const guest: TestUser = {
      id: signup.body.user.id,
      name: 'Convidada',
      email: guestEmail,
      token: signup.body.accessToken,
    };

    const accepted = await apiAs(app, guest)
      .post(`/invitations/token/${token}/accept`)
      .expect(200);
    expect(accepted.body).toEqual({ organizationId: orgId });

    const members = await apiAs(app, owner)
      .get(`/organizations/${orgId}/members`)
      .expect(200);
    expect(
      members.body.find((m: { id: string }) => m.id === guest.id)?.role,
    ).toBe('MEMBER');

    // o link não vale de novo e o convite sai da lista
    await apiAs(app, guest)
      .post(`/invitations/token/${token}/accept`)
      .expect(404);
    const list = await apiAs(app, owner)
      .get(`/organizations/${orgId}/invitations`)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('convite expirado não é aceito', async () => {
    const email = `atrasada-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
    await apiAs(app, owner)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email })
      .expect(201);
    const { token: late } = await tokenFromMail(email);
    await app.get(PrismaService).invitation.updateMany({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const preview = await apiAs(app)
      .get(`/invitations/token/${late}`)
      .expect(200);
    expect(preview.body.expired).toBe(true);
    const user = await apiAs(app)
      .post('/auth/register')
      .send({ name: 'Atrasada', email, password: 'SenhaForte123' })
      .expect(201);
    await apiAs(app, { ...owner, token: user.body.accessToken })
      .post(`/invitations/token/${late}/accept`)
      .expect(410);
  });

  it('convidar de novo troca o link; cancelar invalida', async () => {
    const email = `de-novo-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
    await apiAs(app, owner)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email })
      .expect(201);
    const first = (await tokenFromMail(email)).token;

    const again = await apiAs(app, owner)
      .post(`/organizations/${orgId}/invitations`)
      .send({ email })
      .expect(201);
    const second = await eventually(
      () => tokenFromMail(email),
      (r) => r.token !== first,
    );
    await apiAs(app).get(`/invitations/token/${first}`).expect(404);
    await apiAs(app).get(`/invitations/token/${second.token}`).expect(200);

    await apiAs(app, member)
      .delete(`/invitations/${again.body.id}`)
      .expect(403);
    await apiAs(app, owner).delete(`/invitations/${again.body.id}`).expect(204);
    await apiAs(app).get(`/invitations/token/${second.token}`).expect(404);
  });
});
