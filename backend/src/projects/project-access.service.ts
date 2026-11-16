import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationMember, OrganizationRole, Project } from '@prisma/client';
import {
  OrganizationAccessService,
  roleRank,
} from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ProjectAccess {
  project: Project;
  membership: OrganizationMember;
}

/**
 * Acesso a um projeto deriva da participação na organização dele.
 * Quem não é membro recebe 404, assim como nas organizações.
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrganizationAccessService,
  ) {}

  async getAccess(projectId: string, userId: string): Promise<ProjectAccess> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    return this.forProject(project, userId);
  }

  /** Mesmo que getAccess, para quem já carregou o projeto (quadros, tarefas). */
  async forProject(project: Project, userId: string): Promise<ProjectAccess> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.organizationId,
          userId,
        },
      },
    });
    if (!membership) throw new NotFoundException('Projeto não encontrado');

    return { project, membership };
  }

  /** Gerenciar o projeto: o próprio criador ou ADMIN+ da organização. */
  async assertCanManage(projectId: string, userId: string) {
    const access = await this.getAccess(projectId, userId);
    this.assertManager(access, userId);
    return access;
  }

  assertManager({ project, membership }: ProjectAccess, userId: string) {
    const isCreator = project.createdById === userId;
    const isAdmin =
      roleRank(membership.role) >= roleRank(OrganizationRole.ADMIN);
    if (!isCreator && !isAdmin) {
      throw new ForbiddenException('Permissão insuficiente neste projeto');
    }
  }

  /** Exige um papel mínimo na organização do projeto. */
  async assertRole(
    projectId: string,
    userId: string,
    minimum: OrganizationRole,
  ) {
    const access = await this.getAccess(projectId, userId);
    if (roleRank(access.membership.role) < roleRank(minimum)) {
      throw new ForbiddenException('Permissão insuficiente neste projeto');
    }
    return access;
  }

  /** Projetos arquivados ficam somente leitura até serem desarquivados. */
  assertNotArchived(project: Project) {
    if (project.archived) {
      throw new ForbiddenException('Projeto arquivado é somente leitura');
    }
  }

  assertOrgMember(organizationId: string, userId: string) {
    return this.orgAccess.getMembership(organizationId, userId);
  }
}
