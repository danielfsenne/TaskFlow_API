import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { BoardAccessService } from '../boards/board-access.service';
import { planMove, positionBetween } from '../common/position';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectAccess,
  ProjectAccessService,
} from '../projects/project-access.service';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  MoveTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';

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

interface TaskAccess extends ProjectAccess {
  task: Task;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly boardAccess: BoardAccessService,
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
    return present(task);
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
    await this.getAccess(id, userId);
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: taskInclude,
    });
    return present(task);
  }

  async update(id: string, userId: string, dto: UpdateTaskDto) {
    await this.getWritable(id, userId);
    const task = await this.prisma.task.update({
      where: { id },
      data: dto,
      include: taskInclude,
    });
    return present(task);
  }

  /**
   * Move a tarefa para `columnId`, logo abaixo de `afterTaskId` (null = topo).
   * Serve tanto para reordenar na mesma coluna quanto para trocar de coluna.
   */
  async move(id: string, userId: string, dto: MoveTaskDto) {
    const { task } = await this.getWritable(id, userId);
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

    await this.prisma.$transaction(async (tx) => {
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

      if (plan.kind === 'single') {
        await tx.task.update({
          where: { id },
          data: { columnId: column.id, position: plan.position },
        });
        return;
      }

      for (const { id: taskId, position } of plan.updates) {
        await tx.task.update({
          where: { id: taskId },
          data:
            taskId === id ? { columnId: column.id, position } : { position },
        });
      }
    });

    return this.findOne(id, userId);
  }

  /** Substitui a lista de responsáveis; todos precisam ser da organização. */
  async setAssignees(id: string, userId: string, userIds: string[]) {
    const { project } = await this.getWritable(id, userId);
    await this.assertOrgMembers(project.organizationId, userIds);

    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({
        where: { taskId: id, userId: { notIn: userIds } },
      }),
      this.prisma.taskAssignee.createMany({
        data: userIds.map((u) => ({ taskId: id, userId: u })),
        skipDuplicates: true,
      }),
    ]);

    return this.findOne(id, userId);
  }

  /** Excluir: o autor da tarefa, ou quem gerencia o projeto. */
  async remove(id: string, userId: string) {
    const access = await this.getWritable(id, userId);
    if (access.task.createdById !== userId) {
      try {
        this.projectAccess.assertManager(access, userId);
      } catch {
        throw new ForbiddenException(
          'Só o autor da tarefa ou quem gerencia o projeto pode excluí-la',
        );
      }
    }
    await this.prisma.task.delete({ where: { id } });
  }

  private async getAccess(id: string, userId: string): Promise<TaskAccess> {
    const found = await this.prisma.task.findUnique({
      where: { id },
      include: { board: { include: { project: true } } },
    });
    if (!found) throw new NotFoundException('Tarefa não encontrada');

    const {
      board: { project },
      ...task
    } = found;
    try {
      const access = await this.projectAccess.forProject(project, userId);
      return { ...access, task };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException('Tarefa não encontrada');
      }
      throw e;
    }
  }

  private async getWritable(id: string, userId: string) {
    const access = await this.getAccess(id, userId);
    this.projectAccess.assertNotArchived(access.project);
    return access;
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
