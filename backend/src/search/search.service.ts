import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TASKS_LIMIT = 15;
const OTHERS_LIMIT = 8;

const like = (q: string) => ({
  contains: q,
  mode: Prisma.QueryMode.insensitive,
});

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  // só o que está nas organizações da pessoa
  async search(userId: string, q: string) {
    const mine = { members: { some: { userId } } };

    const [tasks, projects, boards] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          board: { project: { organization: mine } },
          OR: [{ title: like(q) }, { description: like(q) }],
        },
        select: {
          id: true,
          title: true,
          priority: true,
          completedAt: true,
          boardId: true,
          board: {
            select: {
              name: true,
              project: { select: { id: true, name: true, archived: true } },
            },
          },
        },
        // abertas antes das concluídas, mais recentes primeiro
        orderBy: [
          { completedAt: { sort: 'desc', nulls: 'first' } },
          { updatedAt: 'desc' },
        ],
        take: TASKS_LIMIT,
      }),
      this.prisma.project.findMany({
        where: {
          organization: mine,
          OR: [{ name: like(q) }, { description: like(q) }],
        },
        select: {
          id: true,
          name: true,
          archived: true,
          organization: { select: { id: true, name: true } },
        },
        orderBy: [{ archived: 'asc' }, { updatedAt: 'desc' }],
        take: OTHERS_LIMIT,
      }),
      this.prisma.board.findMany({
        where: { project: { organization: mine }, name: like(q) },
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true, archived: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: OTHERS_LIMIT,
      }),
    ]);

    return {
      tasks: tasks.map(({ board, ...t }) => ({
        ...t,
        boardName: board.name,
        project: board.project,
      })),
      projects,
      boards,
    };
  }
}
