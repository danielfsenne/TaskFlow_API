import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { TaskAccessService } from '../tasks/task-access.service';
import { taskEventData } from '../tasks/tasks.service';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
} from './dto/comment.dto';

const commentInclude = {
  author: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.CommentInclude;

const EXCERPT_LENGTH = 140;

function excerpt(text: string) {
  return text.length > EXCERPT_LENGTH
    ? text.slice(0, EXCERPT_LENGTH - 1) + '…'
    : text;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
    private readonly notifications: NotificationsProducer,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(taskId: string, userId: string, dto: CreateCommentDto) {
    const { task, project } = await this.taskAccess.getWritable(taskId, userId);
    const comment = await this.prisma.comment.create({
      data: { taskId, authorId: userId, content: dto.content },
      include: commentInclude,
    });

    const assignees = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { userId: true },
    });
    this.notifications.notify(
      NotificationType.TaskCommented,
      userId,
      [task.createdById, ...assignees.map((a) => a.userId)],
      {
        ...taskEventData(task, project),
        commentId: comment.id,
        excerpt: excerpt(comment.content),
      },
    );
    this.realtime.toBoard(task.boardId, RealtimeEvent.CommentCreated, userId, {
      taskId,
      comment,
    });
    return comment;
  }

  async findAll(taskId: string, userId: string, query: ListCommentsQueryDto) {
    await this.taskAccess.getAccess(taskId, userId);

    const items = await this.prisma.comment.findMany({
      where: { taskId },
      include: commentInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = items.length > query.limit;
    const page = hasMore ? items.slice(0, query.limit) : items;
    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async update(id: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.findWritable(id, userId);
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Só o autor pode editar o comentário');
    }
    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content: dto.content },
      include: commentInclude,
    });
    this.realtime.toBoard(
      comment.access.task.boardId,
      RealtimeEvent.CommentUpdated,
      userId,
      { taskId: comment.taskId, comment: updated },
    );
    return updated;
  }

  async remove(id: string, userId: string) {
    const comment = await this.findWritable(id, userId);
    if (
      comment.authorId !== userId &&
      !this.taskAccess.isManager(comment.access, userId)
    ) {
      throw new ForbiddenException(
        'Só o autor ou quem gerencia o projeto pode excluir o comentário',
      );
    }
    await this.prisma.comment.delete({ where: { id } });
    this.realtime.toBoard(
      comment.access.task.boardId,
      RealtimeEvent.CommentDeleted,
      userId,
      { taskId: comment.taskId, commentId: id },
    );
  }

  private async findWritable(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');

    try {
      const access = await this.taskAccess.getWritable(comment.taskId, userId);
      return { ...comment, access };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException('Comentário não encontrado');
      }
      throw e;
    }
  }
}
