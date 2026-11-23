import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import {
  OrganizationAccessService,
  roleRank,
} from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const listSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // convidar de novo o mesmo e-mail troca o link e renova o prazo
  async invite(
    organizationId: string,
    actorId: string,
    email: string,
    role: OrganizationRole,
  ) {
    const actor = await this.access.assertRole(
      organizationId,
      actorId,
      OrganizationRole.ADMIN,
    );
    if (roleRank(role) >= roleRank(actor.role)) {
      throw new ForbiddenException(`Você não pode atribuir o papel ${role}`);
    }

    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email } },
    });
    if (member) {
      throw new ConflictException('Essa pessoa já é membro da organização');
    }

    const token = randomBytes(32).toString('hex');
    const data = {
      role,
      tokenHash: hashToken(token),
      invitedById: actorId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      acceptedAt: null,
    };
    const invitation = await this.prisma.invitation.upsert({
      where: { organizationId_email: { organizationId, email } },
      create: { organizationId, email, ...data },
      update: data,
      select: {
        ...listSelect,
        organization: { select: { name: true } },
      },
    });

    const { organization, ...rest } = invitation;
    void this.mail.sendInvitation(
      email,
      invitation.invitedBy.name,
      organization.name,
      `${this.config.getOrThrow('APP_URL')}/invite?token=${token}`,
    );
    return rest;
  }

  async list(organizationId: string, actorId: string) {
    await this.access.assertRole(
      organizationId,
      actorId,
      OrganizationRole.ADMIN,
    );
    return this.prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, actorId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });
    if (!invitation || invitation.acceptedAt) {
      throw new NotFoundException('Convite não encontrado');
    }
    await this.access.assertRole(
      invitation.organizationId,
      actorId,
      OrganizationRole.ADMIN,
    );
    await this.prisma.invitation.delete({ where: { id } });
  }

  // dados para a tela do link, antes de entrar ou criar a conta
  async preview(token: string) {
    const invitation = await this.findByToken(token);
    return {
      email: invitation.email,
      role: invitation.role,
      organization: invitation.organization,
      invitedBy: invitation.invitedBy,
      expired: invitation.expiresAt < new Date(),
    };
  }

  async accept(token: string, userId: string) {
    const invitation = await this.findByToken(token);
    if (invitation.expiresAt < new Date()) {
      throw new GoneException('Este convite expirou. Peça um novo.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.email !== invitation.email) {
      throw new ForbiddenException(
        `Este convite é para ${invitation.email}. Entre com essa conta para aceitar.`,
      );
    }

    // aceite e entrada na organização juntos; dois cliques não duplicam
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw new BadRequestException('Convite já usado');
      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
        },
        update: {},
      });
    });
    return { organizationId: invitation.organizationId };
  }

  private async findByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        organization: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true } },
      },
    });
    if (!invitation || invitation.acceptedAt) {
      throw new NotFoundException('Convite não encontrado ou já usado');
    }
    return invitation;
  }
}
