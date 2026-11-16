import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Project, Task } from '@prisma/client';
import { BoardAccessService } from '../boards/board-access.service';
import {
  changedPositions,
  planMove,
  positionBetween,
} from '../common/position';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  MoveTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TaskAccessService } from './task-access.service';

const userSummary = { select: { id: true, name: true, avatarUrl: true } };

const taskInclude = {
  createdBy: userSummary,
  assignees: {
    select: { assignedAt: true, user: userSummary },
    orderBy: { assignedAt: 'asc' },
  },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/** Achata `assignees: [{ user }]` em uma lista de usuários. */
function present({ assignees, ...task }: TaskWithRelations) {
  return {
    ...task,
    assignees: assignees.map(({ user, assignedAt }) => ({
      ...user,
      assignedAt,
    })),
  };
}

/** Dados comuns gravados nas notificações sobre uma tarefa. */
export function taskEventData(
  task: Pick<Task, 'id' | 'title' | 'boardId'>,
  project: Pick<Project, 'id' | 'name' | 'organizationId'>,
) {
  return {
    taskId: task.id,
    taskTitle: task.title,
    boardId: task.boardId,
    projectId: project.id,
    projectName: project.name,
    organizationId: project.organizationId,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boardAccess: BoardAccessService,
    private readonly taskAccess: TaskAccessService,
    private readonly notifications: NotificationsProducer,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(boardId: string, userId: string, dto: CreateTaskDto) {
    const { project } = await this.boardAccess.getWritableBoard(
      boardId,
      userId,
    );
    const { assigneeIds = [], columnId: requestedColumn, ...fields } = dto;

    const column = requestedColumn
      ? await this.prisma.boardColumn.findFirst({
          where: { id: requestedColumn, boardId },
        })
      : await this.prisma.boardColumn.findFirst({
          where: { boardId },
          orderBy: { position: 'asc' },
        });
    if (!column) {
      throw new BadRequestException(
        requestedColumn
          ? 'Coluna não pertence a este quadro'
          : 'O quadro não tem colunas',
      );
    }

    await this.assertOrgMembers(project.organizationId, assigneeIds);

    const last = await this.prisma.task.findFirst({
      where: { columnId: column.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const task = await this.prisma.task.create({
      data: {
        ...fields,
        boardId,
        columnId: column.id,
        createdById: userId,
        position: positionBetween(last?.position ?? null, null),
        assignees: { create: assigneeIds.map((id) => ({ userId: id })) },
      },
      include: taskInclude,
    });
    this.notifications.notify(
      NotificationType.TaskAssigned,
      userId,
      assigneeIds,
      taskEventData(task, project),
    );
    const created = present(task);
    this.realtime.toBoard(boardId, RealtimeEvent.TaskCreated, userId, {
      task: created,
    });
    return created;
  }

  async findAll(boardId: string, userId: string, query: ListTasksQueryDto) {
    await this.boardAccess.getBoardAccess(boardId, userId);
    const tasks = await this.prisma.task.findMany({
      where: {
        boardId,
        columnId: query.columnId,
        priority: query.priority,
        title: query.search
          ? { contains: query.search, mode: 'insensitive' }
          : undefined,
        assignees: query.assigneeId
          ? { some: { userId: query.assigneeId } }
          : undefined,
      },
      include: taskInclude,
      orderBy: [{ column: { position: 'asc' } }, { position: 'asc' }],
    });
    return tasks.map(present);
  }

  async findOne(id: string, userId: string) {
    await this.taskAccess.getAccess(id, userId);
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: taskInclude,
    });
    return present(task);
  }

  async update(id: string, userId: string, dto: UpdateTaskDto) {
    await this.taskAccess.getWritable(id, userId);
    const task = present(
      await this.prisma.task.update({
        where: { id },
        data: dto,
        include: taskInclude,
      }),
    );
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskUpdated, userId, {
      task,
    });
    return task;
  }

  /**
   * Move a tarefa para `columnId`, logo abaixo de `afterTaskId` (null = topo).
   * Serve tanto para reordenar na mesma coluna quanto para trocar de coluna.
   */
  async move(id: string, userId: string, dto: MoveTaskDto) {
    const { task } = await this.taskAccess.getWritable(id, userId);
    if (dto.afterTaskId === id) {
      throw new BadRequestException(
        'Uma tarefa não pode ficar abaixo de si mesma',
      );
    }

    const column = await this.prisma.boardColumn.findFirst({
      where: { id: dto.columnId, boardId: task.boardId },
    });
    if (!column) {
      throw new NotFoundException('Coluna de destino não encontrada no quadro');
    }

    const positions = await this.prisma.$transaction(async (tx) => {
      const others = await tx.task.findMany({
        where: { columnId: column.id, id: { not: id } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });

      const plan = planMove(others, dto.afterTaskId, id);
      if (!plan) {
        throw new NotFoundException(
          'Tarefa de referência não encontrada na coluna de destino',
        );
      }

      const positions = changedPositions(plan, id);
      for (const { id: taskId, position } of positions) {
        await tx.task.update({
          where: { id: taskId },
          data:
            taskId === id ? { columnId: column.id, position } : { position },
        });
      }
      return positions;
    });

    const moved = await this.findOne(id, userId);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskMoved, userId, {
      task: moved,
      fromColumnId: task.columnId,
      positions,
    });
    return moved;
  }

  /** Substitui a lista de responsáveis; todos precisam ser da organização. */
  async setAssignees(id: string, userId: string, userIds: string[]) {
    const { project, task } = await this.taskAccess.getWritable(id, userId);
    await this.assertOrgMembers(project.organizationId, userIds);

    const current = await this.prisma.taskAssignee.findMany({
      where: { taskId: id },
      select: { userId: true },
    });
    const before = new Set(current.map((a) => a.userId));
    const added = userIds.filter((u) => !before.has(u));

    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({
        where: { taskId: id, userId: { notIn: userIds } },
      }),
      this.prisma.taskAssignee.createMany({
        data: userIds.map((u) => ({ taskId: id, userId: u })),
        skipDuplicates: true,
      }),
    ]);

    // Só quem acabou de entrar na lista é notificado.
    this.notifications.notify(
      NotificationType.TaskAssigned,
      userId,
      added,
      taskEventData(task, project),
    );
    const updated = await this.findOne(id, userId);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskUpdated, userId, {
      task: updated,
    });
    return updated;
  }

  /** Excluir: o autor da tarefa, ou quem gerencia o projeto. */
  async remove(id: string, userId: string) {
    const access = await this.taskAccess.getWritable(id, userId);
    if (
      access.task.createdById !== userId &&
      !this.taskAccess.isManager(access, userId)
    ) {
      throw new ForbiddenException(
        'Só o autor da tarefa ou quem gerencia o projeto pode excluí-la',
      );
    }
    await this.prisma.task.delete({ where: { id } });
    this.realtime.toBoard(
      access.task.boardId,
      RealtimeEvent.TaskDeleted,
      userId,
      { taskId: id, columnId: access.task.columnId },
    );
  }

  private async assertOrgMembers(organizationId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const count = await this.prisma.organizationMember.count({
      where: { organizationId, userId: { in: userIds } },
    });
    if (count !== userIds.length) {
      throw new BadRequestException(
        'Todos os responsáveis precisam ser membros da organização',
      );
    }
  }
}
