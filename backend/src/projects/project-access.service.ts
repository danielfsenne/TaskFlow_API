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

  assertNotArchived(project: Project) {
    if (project.archived) {
      throw new ForbiddenException('Projeto arquivado é somente leitura');
    }
  }

  assertOrgMember(organizationId: string, userId: string) {
    return this.orgAccess.getMembership(organizationId, userId);
  }
}
