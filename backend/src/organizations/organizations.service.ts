import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect } from '../users/users.service';
import {
  AddMemberDto,
  AssignableRole,
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import {
  OrganizationAccessService,
  roleRank,
} from './organization-access.service';
import { slugify } from './slug';

const memberSelect = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
} satisfies Prisma.OrganizationMemberSelect;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    const base = slugify(dto.name) || 'org';

    for (let attempt = 0; attempt < 5; attempt++) {
      const slug =
        attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      try {
        const org = await this.prisma.organization.create({
          data: {
            name: dto.name,
            slug,
            members: { create: { userId, role: OrganizationRole.OWNER } },
          },
        });
        return { ...org, role: OrganizationRole.OWNER };
      } catch (e) {
        if (!this.isUniqueViolation(e)) throw e;
      }
    }
    throw new ConflictException('Não foi possível gerar um slug único');
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { organization: { name: 'asc' } },
    });
    return memberships.map(({ organization, role }) => ({
      ...organization,
      role,
    }));
  }

  async findOne(id: string, userId: string) {
    const { role } = await this.access.getMembership(id, userId);
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { members: true, projects: true } } },
    });
    return { ...org, role };
  }

  async update(id: string, userId: string, dto: UpdateOrganizationDto) {
    await this.access.assertRole(id, userId, OrganizationRole.ADMIN);
    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.access.assertRole(id, userId, OrganizationRole.OWNER);
    await this.prisma.organization.delete({ where: { id } });
  }

  async listMembers(id: string, userId: string) {
    await this.access.getMembership(id, userId);
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id },
      select: memberSelect,
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(({ user, ...rest }) => ({ ...user, ...rest }));
  }

  async addMember(id: string, actorId: string, dto: AddMemberDto) {
    const actor = await this.access.assertRole(
      id,
      actorId,
      OrganizationRole.ADMIN,
    );
    this.assertCanAssign(actor.role, dto.role);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    try {
      const member = await this.prisma.organizationMember.create({
        data: { organizationId: id, userId: user.id, role: dto.role },
        select: memberSelect,
      });
      return { ...member.user, role: member.role, joinedAt: member.joinedAt };
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException('Usuário já é membro da organização');
      }
      throw e;
    }
  }

  async updateMemberRole(
    id: string,
    actorId: string,
    targetId: string,
    role: AssignableRole,
  ) {
    if (actorId === targetId) {
      throw new BadRequestException('Você não pode alterar o próprio papel');
    }
    const actor = await this.access.assertRole(
      id,
      actorId,
      OrganizationRole.ADMIN,
    );
    const target = await this.findMemberOrThrow(id, targetId);

    this.assertOutranks(actor.role, target.role);
    this.assertCanAssign(actor.role, role);

    const member = await this.prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: id, userId: targetId },
      },
      data: { role },
      select: memberSelect,
    });
    return { ...member.user, role: member.role, joinedAt: member.joinedAt };
  }

  async removeMember(id: string, actorId: string, targetId: string) {
    const actor = await this.access.getMembership(id, actorId);

    if (actorId === targetId) {
      if (actor.role === OrganizationRole.OWNER) {
        throw new BadRequestException(
          'O dono não pode sair da organização; exclua-a ou transfira a posse',
        );
      }
    } else {
      const target = await this.findMemberOrThrow(id, targetId);
      this.assertOutranks(actor.role, target.role);
    }

    await this.prisma.organizationMember.delete({
      where: {
        organizationId_userId: { organizationId: id, userId: targetId },
      },
    });
  }

  private async findMemberOrThrow(organizationId: string, userId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!member) throw new NotFoundException('Membro não encontrado');
    return member;
  }

  /** Só é possível gerenciar quem tem papel inferior ao seu. */
  private assertOutranks(actor: OrganizationRole, target: OrganizationRole) {
    if (roleRank(actor) <= roleRank(target)) {
      throw new ForbiddenException('Você não pode gerenciar este membro');
    }
  }

  /** Só é possível atribuir papéis abaixo do seu (ADMIN → MEMBER; OWNER → ADMIN/MEMBER). */
  private assertCanAssign(actor: OrganizationRole, role: OrganizationRole) {
    if (roleRank(role) >= roleRank(actor)) {
      throw new ForbiddenException(`Você não pode atribuir o papel ${role}`);
    }
  }

  private isUniqueViolation(e: unknown) {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    );
  }
}
