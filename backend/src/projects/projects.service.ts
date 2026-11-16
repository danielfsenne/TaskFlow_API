import { Injectable } from '@nestjs/common';
import { OrganizationRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectAccessService } from './project-access.service';

const projectInclude = {
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { boards: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateProjectDto) {
    await this.access.assertOrgMember(organizationId, userId);
    return this.prisma.project.create({
      data: { ...dto, organizationId, createdById: userId },
      include: projectInclude,
    });
  }

  async findAll(
    organizationId: string,
    userId: string,
    query: ListProjectsQueryDto,
  ) {
    await this.access.assertOrgMember(organizationId, userId);
    return this.prisma.project.findMany({
      where: { organizationId, archived: query.archived ?? false },
      include: projectInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    await this.access.getAccess(id, userId);
    return this.prisma.project.findUniqueOrThrow({
      where: { id },
      include: projectInclude,
    });
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    const { project } = await this.access.assertCanManage(id, userId);

    // Num projeto arquivado, a única alteração permitida é desarquivar.
    const { archived, ...fields } = dto;
    if (Object.keys(fields).length > 0 && archived !== false) {
      this.access.assertNotArchived(project);
    }

    return this.prisma.project.update({
      where: { id },
      data: dto,
      include: projectInclude,
    });
  }

  /** Excluir é destrutivo: exige ADMIN+, mesmo para o criador. */
  async remove(id: string, userId: string) {
    await this.access.assertRole(id, userId, OrganizationRole.ADMIN);
    await this.prisma.project.delete({ where: { id } });
  }
}
