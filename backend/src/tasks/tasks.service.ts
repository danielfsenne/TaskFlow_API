import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Project, Task } from '@prisma/client';
import { BoardAccessService } from '../boards/board-access.service';
import { labelSelect } from '../boards/labels.service';
import { doneColumnId } from '../common/completion';
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
import { ActivityType, TaskActivityService } from './task-activity.service';
import { TaskAccessService } from './task-access.service';

const userSummary = { select: { id: true, name: true, avatarUrl: true } };

const taskInclude = {
  createdBy: userSummary,
  assignees: {
    select: { assignedAt: true, user: userSummary },
    orderBy: { assignedAt: 'asc' },
  },
  labels: {
    select: { label: { select: labelSelect } },
    orderBy: { label: { name: 'asc' } },
  },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function present({ assignees, labels, ...task }: TaskWithRelations) {
  return {
    ...task,
    labels: labels.map((l) => l.label),
    assignees: assignees.map(({ user, assignedAt }) => ({
      ...user,
      assignedAt,
    })),
  };
}

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
    private readonly activity: TaskActivityService,
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

    const [last, done] = await Promise.all([
      this.prisma.task.findFirst({
        where: { columnId: column.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      }),
      doneColumnId(this.prisma, boardId),
    ]);

    const task = await this.prisma.task.create({
      data: {
        ...fields,
        boardId,
        columnId: column.id,
        createdById: userId,
        position: positionBetween(last?.position ?? null, null),
        completedAt: column.id === done ? new Date() : null,
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
    await this.activity.record(task.id, userId, [
      { type: ActivityType.Created, data: { column: column.name } },
    ]);
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
        labels: query.labelId
          ? { some: { labelId: query.labelId } }
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
    const { task: before } = await this.taskAccess.getWritable(id, userId);
    const changes = this.activity.changes(before, dto);
    const task = present(
      await this.prisma.task.update({
        where: { id },
        // prazo novo libera um novo lembrete
        data:
          dto.dueDate !== undefined
            ? { ...dto, dueReminderSentAt: null, overdueSentAt: null }
            : dto,
        include: taskInclude,
      }),
    );
    await this.activity.record(id, userId, changes);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskUpdated, userId, {
      task,
    });
    return task;
  }

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

      const completion: Prisma.TaskUncheckedUpdateInput = {};
      if (column.id !== task.columnId) {
        const done = await doneColumnId(tx, task.boardId);
        completion.completedAt = column.id === done ? new Date() : null;
      }

      const positions = changedPositions(plan, id);
      for (const { id: taskId, position } of positions) {
        await tx.task.update({
          where: { id: taskId },
          data:
            taskId === id
              ? { columnId: column.id, position, ...completion }
              : { position },
        });
      }
      return positions;
    });

    if (column.id !== task.columnId) {
      const from = await this.prisma.boardColumn.findUnique({
        where: { id: task.columnId },
        select: { name: true },
      });
      await this.activity.record(id, userId, [
        {
          type: ActivityType.Moved,
          data: { from: from?.name ?? null, to: column.name },
        },
      ]);
    }

    const moved = await this.findOne(id, userId);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskMoved, userId, {
      task: moved,
      fromColumnId: task.columnId,
      positions,
    });
    return moved;
  }

  async setAssignees(id: string, userId: string, userIds: string[]) {
    const { project, task } = await this.taskAccess.getWritable(id, userId);
    await this.assertOrgMembers(project.organizationId, userIds);

    const current = await this.prisma.taskAssignee.findMany({
      where: { taskId: id },
      select: { userId: true },
    });
    const before = new Set(current.map((a) => a.userId));
    const added = userIds.filter((u) => !before.has(u));
    const removed = [...before].filter((u) => !userIds.includes(u));

    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({
        where: { taskId: id, userId: { notIn: userIds } },
      }),
      this.prisma.taskAssignee.createMany({
        data: userIds.map((u) => ({ taskId: id, userId: u })),
        skipDuplicates: true,
      }),
    ]);

    this.notifications.notify(
      NotificationType.TaskAssigned,
      userId,
      added,
      taskEventData(task, project),
    );
    if (added.length || removed.length) {
      const names = new Map(
        (
          await this.prisma.user.findMany({
            where: { id: { in: [...added, ...removed] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      );
      await this.activity.record(id, userId, [
        {
          type: ActivityType.Assignees,
          data: {
            added: added.map((u) => names.get(u) ?? '?'),
            removed: removed.map((u) => names.get(u) ?? '?'),
          },
        },
      ]);
    }
    const updated = await this.findOne(id, userId);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskUpdated, userId, {
      task: updated,
    });
    return updated;
  }

  // todas precisam ser etiquetas do quadro da tarefa
  async setLabels(id: string, userId: string, labelIds: string[]) {
    const { task } = await this.taskAccess.getWritable(id, userId);
    const count = await this.prisma.label.count({
      where: {
        id: { in: labelIds },
        project: { boards: { some: { id: task.boardId } } },
      },
    });
    if (count !== labelIds.length) {
      throw new BadRequestException('Etiqueta não pertence a este quadro');
    }
    const current = await this.prisma.taskLabel.findMany({
      where: { taskId: id },
      select: { labelId: true },
    });
    const had = new Set(current.map((l) => l.labelId));
    const addedIds = labelIds.filter((l) => !had.has(l));
    const removedIds = [...had].filter((l) => !labelIds.includes(l));
    await this.prisma.$transaction([
      this.prisma.taskLabel.deleteMany({
        where: { taskId: id, labelId: { notIn: labelIds } },
      }),
      this.prisma.taskLabel.createMany({
        data: labelIds.map((labelId) => ({ taskId: id, labelId })),
        skipDuplicates: true,
      }),
    ]);
    if (addedIds.length || removedIds.length) {
      const labels = await this.prisma.label.findMany({
        where: { id: { in: [...addedIds, ...removedIds] } },
        select: labelSelect,
      });
      const pick = (ids: string[]) =>
        labels
          .filter((l) => ids.includes(l.id))
          .map(({ name, color }) => ({ name, color }));
      await this.activity.record(id, userId, [
        {
          type: ActivityType.Labels,
          data: { added: pick(addedIds), removed: pick(removedIds) },
        },
      ]);
    }
    const updated = await this.findOne(id, userId);
    this.realtime.toBoard(task.boardId, RealtimeEvent.TaskUpdated, userId, {
      task: updated,
    });
    return updated;
  }

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
