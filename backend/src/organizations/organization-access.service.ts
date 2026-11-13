import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMember, OrganizationRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_RANK: Record<OrganizationRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleRank(role: OrganizationRole) {
  return ROLE_RANK[role];
}

/**
 * Centraliza as checagens de acesso a uma organização.
 * Quem não é membro recebe 404, para não revelar que a organização existe.
 */
@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Organização não encontrada');
    }
    return membership;
  }

  async assertRole(
    organizationId: string,
    userId: string,
    minimum: OrganizationRole,
  ): Promise<OrganizationMember> {
    const membership = await this.getMembership(organizationId, userId);
    if (roleRank(membership.role) < roleRank(minimum)) {
      throw new ForbiddenException('Permissão insuficiente nesta organização');
    }
    return membership;
  }
}
