import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { createHash } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const env: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'r'.repeat(32),
    JWT_REFRESH_EXPIRES_IN: '7d',
    APP_URL: 'http://app.test',
  };
  const config = { getOrThrow: (k: string) => env[k] } as ConfigService;
  const prisma = {
    $transaction: jest.fn(),
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const mail = { sendPasswordReset: jest.fn() };
  const users = { findByEmail: jest.fn(), create: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AuthService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      new JwtService(),
      config,
      mail as unknown as MailService,
    );
  });

  it('impede cadastro com e-mail duplicado', async () => {
    users.findByEmail.mockResolvedValue({ id: '1' });
    await expect(
      service.register({ name: 'A', email: 'a@a.com', password: '12345678' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita senha incorreta', async () => {
    users.findByEmail.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      passwordHash: await hash('correta123', 4),
    });
    await expect(
      service.login({ email: 'a@a.com', password: 'errada123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login não expõe o hash da senha', async () => {
    users.findByEmail.mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      name: 'A',
      passwordHash: await hash('correta123', 4),
    });
    const result = await service.login({
      email: 'a@a.com',
      password: 'correta123',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.accessToken).toBeDefined();
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejeita refresh token com assinatura inválida', async () => {
    await expect(service.refresh('token.invalido.x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('reuso de refresh token já rotacionado', () => {
    const token = new JwtService().sign(
      { sub: 'u1', jti: 't1' },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: '7d' },
    );
    const stored = (rotatedAgoMs: number | null) => ({
      id: 't1',
      userId: 'u1',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      rotatedAt:
        rotatedAgoMs === null ? null : new Date(Date.now() - rotatedAgoMs),
      user: { email: 'a@a.com' },
    });

    beforeEach(() => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.$transaction.mockResolvedValue([]);
    });

    it('logo após a rotação (recarregar a página) emite um novo par', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored(2_000));
      const tokens = await service.refresh(token);
      expect(tokens.refreshToken).toBeDefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('depois da tolerância, derruba todas as sessões', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored(60_000));
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('token revogado por logout ou troca de senha é só recusado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(stored(null));
      await expect(service.refresh(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // sem derrubar as outras sessões (a nova, depois da troca de senha)
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('recuperação de senha', () => {
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');

    it('e-mail desconhecido não gera token nem e-mail', async () => {
      users.findByEmail.mockResolvedValue(null);
      await service.forgotPassword('ninguem@a.com');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('envia link com token cujo hash é o que fica salvo', async () => {
      users.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@a.com',
        name: 'Ana Lima',
      });
      prisma.$transaction.mockResolvedValue([]);
      await service.forgotPassword('a@a.com');

      const [to, name, link] = mail.sendPasswordReset.mock.calls[0];
      expect([to, name]).toEqual(['a@a.com', 'Ana Lima']);
      const token = new URL(link).searchParams.get('token')!;
      expect(link.startsWith('http://app.test/reset-password?token=')).toBe(
        true,
      );
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      const saved = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(saved.tokenHash).toBe(sha(token));
      expect(saved.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 59 * 60_000,
      );
    });

    it('token expirado ou já usado é recusado', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('a'.repeat(64), 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(
        service.resetPassword('a'.repeat(64), 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('redefinir troca a senha e derruba as sessões', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      await service.resetPassword('a'.repeat(64), 'novaSenha123');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('troca de senha exige a senha atual', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'u1',
        email: 'a@a.com',
        passwordHash: await hash('atual12345', 4),
      });
      await expect(
        service.changePassword('u1', 'errada123', 'novaSenha123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();

      const tokens = await service.changePassword(
        'u1',
        'atual12345',
        'novaSenha123',
      );
      expect(tokens.refreshToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });
  });
});
