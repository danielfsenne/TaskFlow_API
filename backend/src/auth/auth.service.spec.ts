import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const env: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'r'.repeat(32),
    JWT_REFRESH_EXPIRES_IN: '7d',
  };
  const config = { getOrThrow: (k: string) => env[k] } as ConfigService;
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const users = { findByEmail: jest.fn(), create: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AuthService(
      prisma as unknown as PrismaService,
      users as unknown as UsersService,
      new JwtService(),
      config,
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
});
