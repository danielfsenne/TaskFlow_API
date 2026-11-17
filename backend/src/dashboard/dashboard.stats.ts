import { TaskPriority } from '@prisma/client';

export interface StatTask {
  priority: TaskPriority;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  groupId: string;
  assigneeIds: string[];
}

export interface StatGroup {
  id: string;
  name: string;
}

export interface StatMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export const WEEKS = 8;
const DAY = 24 * 60 * 60 * 1000;
const PRIORITIES: TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export function weekStart(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const offset = (d.getUTCDay() + 6) % 7; // segunda = 0
  return new Date(d.getTime() - offset * DAY);
}

const isOverdue = (t: StatTask, now: Date) =>
  !t.completedAt && !!t.dueDate && t.dueDate < now;

export function computeStats(
  tasks: StatTask[],
  groups: StatGroup[],
  members: StatMember[],
  now = new Date(),
) {
  const soon = new Date(now.getTime() + 7 * DAY);
  const open = tasks.filter((t) => !t.completedAt);

  const totals = {
    total: tasks.length,
    open: open.length,
    completed: tasks.length - open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    dueSoon: open.filter(
      (t) => t.dueDate && t.dueDate >= now && t.dueDate <= soon,
    ).length,
    unassigned: open.filter((t) => t.assigneeIds.length === 0).length,
  };

  const byPriority = PRIORITIES.map((priority) => ({
    priority,
    open: open.filter((t) => t.priority === priority).length,
  }));

  const byMember = members
    .map((user) => {
      const mine = tasks.filter((t) => t.assigneeIds.includes(user.id));
      return {
        user,
        open: mine.filter((t) => !t.completedAt).length,
        completed: mine.filter((t) => t.completedAt).length,
        overdue: mine.filter((t) => isOverdue(t, now)).length,
      };
    })
    .sort((a, b) => b.open - a.open || a.user.name.localeCompare(b.user.name));

  const first = weekStart(new Date(now.getTime() - (WEEKS - 1) * 7 * DAY));
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({
    weekStart: new Date(first.getTime() + i * 7 * DAY).toISOString(),
    created: 0,
    completed: 0,
  }));
  const slot = (date: Date) =>
    Math.floor((weekStart(date).getTime() - first.getTime()) / (7 * DAY));
  for (const t of tasks) {
    const c = slot(t.createdAt);
    if (c >= 0 && c < WEEKS) weekly[c].created++;
    if (t.completedAt) {
      const d = slot(t.completedAt);
      if (d >= 0 && d < WEEKS) weekly[d].completed++;
    }
  }

  const breakdown = groups.map((g) => {
    const mine = tasks.filter((t) => t.groupId === g.id);
    return {
      ...g,
      total: mine.length,
      open: mine.filter((t) => !t.completedAt).length,
      completed: mine.filter((t) => t.completedAt).length,
      overdue: mine.filter((t) => isOverdue(t, now)).length,
    };
  });

  return { totals, byPriority, byMember, weekly, breakdown };
}
