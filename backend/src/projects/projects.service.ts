import { Injectable } from '@nestjs/common';
import { OrganizationRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent, RealtimeEventName } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
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
    private readonly realtime: RealtimeEmitter,
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

    const { archived, ...fields } = dto;
    if (Object.keys(fields).length > 0 && archived !== false) {
      this.access.assertNotArchived(project);
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: dto,
      include: projectInclude,
    });
    await this.toBoards(id, RealtimeEvent.ProjectUpdated, userId, {
      project: updated,
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    const { project } = await this.access.assertRole(
      id,
      userId,
      OrganizationRole.ADMIN,
    );
    // os quadros somem junto (cascade): guarda os ids antes de apagar
    const boards = await this.boardIds(id);
    await this.prisma.project.delete({ where: { id } });
    for (const boardId of boards) {
      this.realtime.toBoard(boardId, RealtimeEvent.ProjectDeleted, userId, {
        projectId: id,
        organizationId: project.organizationId,
      });
    }
  }

  private async boardIds(projectId: string) {
    const boards = await this.prisma.board.findMany({
      where: { projectId },
      select: { id: true },
    });
    return boards.map((b) => b.id);
  }

  private async toBoards(
    projectId: string,
    event: RealtimeEventName,
    actorId: string,
    data: Record<string, unknown>,
  ) {
    for (const boardId of await this.boardIds(projectId)) {
      this.realtime.toBoard(boardId, event, actorId, data);
    }
  }
}
