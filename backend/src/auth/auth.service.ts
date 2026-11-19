import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash, hashSync } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload, RefreshTokenPayload } from './types/auth-user';

const BCRYPT_ROUNDS = 10;
const ROTATION_GRACE_MS = 30_000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// e-mail inexistente também compara um hash, para não vazar pelo tempo de resposta
const DUMMY_HASH = hashSync(randomUUID(), BCRYPT_ROUNDS);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
    });

    return { user, ...(await this.issueTokens(user.id, user.email)) };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...publicUser } = user;
    return {
      user: publicUser,
      ...(await this.issueTokens(user.id, user.email)),
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: { select: { email: true } } },
    });

    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.tokenHash !== this.hashToken(refreshToken) ||
      stored.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const now = new Date();
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });

    if (count === 0) {
      // revogado por logout ou troca de senha: só inválido, não é roubo
      if (!stored.rotatedAt) {
        throw new UnauthorizedException('Refresh token inválido');
      }
      // F5 durante o refresh reenvia o token antigo; também não é roubo
      if (now.getTime() - stored.rotatedAt.getTime() >= ROTATION_GRACE_MS) {
        await this.revokeAllForUser(stored.userId);
        throw new UnauthorizedException('Refresh token reutilizado');
      }
    }

    return this.issueTokens(stored.userId, stored.user.email);
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken).catch(
      () => null,
    );
    if (!payload) return;

    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // responde igual exista ou não a conta, para não revelar quem está cadastrado
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);

    const link = `${this.config.getOrThrow('APP_URL')}/reset-password?token=${token}`;
    void this.mail.sendPasswordReset(user.email, user.name, link);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException('Link inválido ou expirado');
    }

    // marca como usado de forma atômica: dois envios do mesmo link não passam
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw new BadRequestException('Link inválido ou expirado');

    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash: await hash(password, BCRYPT_ROUNDS) },
    });
    await this.revokeAllForUser(stored.userId);
  }

  // derruba as outras sessões e devolve um par novo para a sessão atual
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(newPassword, BCRYPT_ROUNDS) },
    });
    await this.revokeAllForUser(userId);
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    });
    return this.issueTokens(user.id, user.email);
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = { sub: userId, email };
    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: userId, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    const { exp } = this.jwt.decode<{ exp: number }>(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string) {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  private async revokeAllForUser(userId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, rotatedAt: { not: null } },
        data: { rotatedAt: null },
      }),
    ]);
  }

  // token aleatório e longo: sha256 basta
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
