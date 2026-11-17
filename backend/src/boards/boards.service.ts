import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { evenPositions } from '../common/position';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { BoardAccessService } from './board-access.service';
import {
  CreateBoardDto,
  DEFAULT_COLUMNS,
  UpdateBoardDto,
} from './dto/board.dto';

const columnsOrdered = {
  orderBy: { position: 'asc' },
  include: { _count: { select: { tasks: true } } },
} satisfies Prisma.Board$columnsArgs;

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly access: BoardAccessService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(projectId: string, userId: string, dto: CreateBoardDto) {
    const { project } = await this.projectAccess.getAccess(projectId, userId);
    this.projectAccess.assertNotArchived(project);

    const names = dto.columns ?? DEFAULT_COLUMNS;
    const positions = evenPositions(names.length);

    return this.prisma.board.create({
      data: {
        projectId,
        name: dto.name,
        columns: {
          create: names.map((name, i) => ({ name, position: positions[i] })),
        },
      },
      include: { columns: columnsOrdered },
    });
  }

  async findAll(projectId: string, userId: string) {
    await this.projectAccess.getAccess(projectId, userId);
    return this.prisma.board.findMany({
      where: { projectId },
      include: { _count: { select: { columns: true, tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    await this.access.getBoardAccess(id, userId);
    return this.prisma.board.findUniqueOrThrow({
      where: { id },
      include: { columns: columnsOrdered },
    });
  }

  async update(id: string, userId: string, dto: UpdateBoardDto) {
    await this.access.getWritableBoard(id, userId);
    const board = await this.prisma.board.update({ where: { id }, data: dto });
    this.realtime.toBoard(id, RealtimeEvent.BoardUpdated, userId, { board });
    return board;
  }

  async remove(id: string, userId: string) {
    const access = await this.access.getWritableBoard(id, userId);
    this.projectAccess.assertManager(access, userId);
    await this.prisma.board.delete({ where: { id } });
    this.realtime.toBoard(id, RealtimeEvent.BoardDeleted, userId, {
      boardId: id,
    });
  }
}
