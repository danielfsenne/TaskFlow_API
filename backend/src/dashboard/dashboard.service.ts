import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { computeStats, StatTask, weekStart } from './dashboard.stats';

const statSelect = {
  priority: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  boardId: true,
  board: { select: { projectId: true } },
  assignees: { select: { userId: true } },
} satisfies Prisma.TaskSelect;

type StatRow = Prisma.TaskGetPayload<{ select: typeof statSelect }>;

const toStat = (t: StatRow, group: (t: StatRow) => string): StatTask => ({
  priority: t.priority,
  dueDate: t.dueDate,
  completedAt: t.completedAt,
  createdAt: t.createdAt,
  groupId: group(t),
  assigneeIds: t.assignees.map((a) => a.userId),
});

const DAY = 24 * 60 * 60 * 1000;
const MY_TASKS_LIMIT = 30;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrganizationAccessService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** Indicadores da organização (só projetos ativos), por projeto. */
  async organization(organizationId: string, userId: string) {
    await this.orgAccess.getMembership(organizationId, userId);
    const [projects, rows, members] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId, archived: false },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { board: { project: { organizationId, archived: false } } },
        select: statSelect,
      }),
      this.members(organizationId),
    ]);
    return computeStats(
      rows.map((r) => toStat(r, (t) => t.board.projectId)),
      projects,
      members,
    );
  }

  /** Indicadores de um projeto, por quadro. */
  async project(projectId: string, userId: string) {
    const { project } = await this.projectAccess.getAccess(projectId, userId);
    const [boards, rows, members] = await Promise.all([
      this.prisma.board.findMany({
        where: { projectId },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: { board: { projectId } },
        select: statSelect,
      }),
      this.members(project.organizationId),
    ]);
    return computeStats(
      rows.map((r) => toStat(r, (t) => t.boardId)),
      boards,
      members,
    );
  }

  /**
   * Painel pessoal: tarefas abertas atribuídas a mim em projetos ativos,
   * mais um resumo de cada organização.
   */
  async me(userId: string, now = new Date()) {
    const mine: Prisma.TaskWhereInput = {
      assignees: { some: { userId } },
      board: { project: { archived: false } },
    };
    const soon = new Date(now.getTime() + 7 * DAY);

    const [open, overdue, dueSoon, completedThisWeek, tasks, orgs] =
      await Promise.all([
        this.prisma.task.count({ where: { ...mine, completedAt: null } }),
        this.prisma.task.count({
          where: { ...mine, completedAt: null, dueDate: { lt: now } },
        }),
        this.prisma.task.count({
          where: {
            ...mine,
            completedAt: null,
            dueDate: { gte: now, lte: soon },
          },
        }),
        this.prisma.task.count({
          where: { ...mine, completedAt: { gte: weekStart(now) } },
        }),
        this.prisma.task.findMany({
          where: { ...mine, completedAt: null },
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            boardId: true,
            column: { select: { name: true } },
            board: {
              select: {
                name: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    organization: { select: { id: true, name: true } },
                  },
                },
              },
            },
            _count: { select: { comments: true } },
          },
          // Prazo mais próximo primeiro; sem prazo vai para o fim.
          orderBy: [
            { dueDate: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'asc' },
          ],
          take: MY_TASKS_LIMIT,
        }),
        this.prisma.organization.findMany({
          where: { members: { some: { userId } } },
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                members: true,
                projects: { where: { archived: false } },
              },
            },
          },
          orderBy: { name: 'asc' },
        }),
      ]);

    const openByOrg = await this.prisma.task.groupBy({
      by: ['boardId'],
      where: {
        completedAt: null,
        board: {
          project: {
            archived: false,
            organizationId: { in: orgs.map((o) => o.id) },
          },
        },
      },
      _count: true,
    });
    const boardOrg = new Map(
      (
        await this.prisma.board.findMany({
          where: { id: { in: openByOrg.map((g) => g.boardId) } },
          select: { id: true, project: { select: { organizationId: true } } },
        })
      ).map((b) => [b.id, b.project.organizationId]),
    );
    const openTasks = new Map<string, number>();
    for (const g of openByOrg) {
      const org = boardOrg.get(g.boardId)!;
      openTasks.set(org, (openTasks.get(org) ?? 0) + g._count);
    }

    return {
      totals: { open, overdue, dueSoon, completedThisWeek },
      tasks: tasks.map(({ board, column, _count, ...t }) => ({
        ...t,
        columnName: column.name,
        boardName: board.name,
        project: { id: board.project.id, name: board.project.name },
        organization: board.project.organization,
        commentCount: _count.comments,
      })),
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        members: o._count.members,
        projects: o._count.projects,
        openTasks: openTasks.get(o.id) ?? 0,
      })),
    };
  }

  private async members(organizationId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return rows.map((r) => r.user);
  }
}
