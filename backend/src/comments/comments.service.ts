import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
} from './dto/comment.dto';

const commentInclude = {
  author: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.CommentInclude;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async create(taskId: string, userId: string, dto: CreateCommentDto) {
    await this.taskAccess.getWritable(taskId, userId);
    return this.prisma.comment.create({
      data: { taskId, authorId: userId, content: dto.content },
      include: commentInclude,
    });
  }

  /**
   * Comentários em ordem cronológica, paginados por cursor.
   * `nextCursor` é null quando não há mais páginas.
   */
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

  /** Editar: só o autor. */
  async update(id: string, userId: string, dto: UpdateCommentDto) {
    const comment = await this.findWritable(id, userId);
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Só o autor pode editar o comentário');
    }
    return this.prisma.comment.update({
      where: { id },
      data: { content: dto.content },
      include: commentInclude,
    });
  }

  /** Excluir: o autor, ou quem gerencia o projeto (moderação). */
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
