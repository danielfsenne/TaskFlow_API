import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { PrismaService } from '../prisma/prisma.service';
import { taskEventData } from '../tasks/tasks.service';

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;
// tarefa esquecida há mais tempo que isso não gera aviso de atraso
export const OVERDUE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

const taskSelect = {
  id: true,
  title: true,
  boardId: true,
  dueDate: true,
  assignees: { select: { userId: true } },
  board: {
    select: {
      project: { select: { id: true, name: true, organizationId: true } },
    },
  },
} as const;

type Marker = 'dueReminderSentAt' | 'overdueSentAt';

@Injectable()
export class DueRemindersService {
  private readonly logger = new Logger(DueRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsProducer,
  ) {}

  // avisa os responsáveis das tarefas abertas que vencem nas próximas 24 h
  sendDueSoon(now = new Date()): Promise<number> {
    return this.send(
      NotificationType.TaskDueSoon,
      'dueReminderSentAt',
      { gt: now, lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) },
      now,
    );
  }

  // e, uma vez, as que passaram do prazo sem serem concluídas
  sendOverdue(now = new Date()): Promise<number> {
    return this.send(
      NotificationType.TaskOverdue,
      'overdueSentAt',
      { lte: now, gt: new Date(now.getTime() - OVERDUE_LOOKBACK_MS) },
      now,
    );
  }

  private async send(
    type: NotificationType,
    marker: Marker,
    dueDate: { gt: Date; lte: Date },
    now: Date,
  ): Promise<number> {
    const tasks = await this.prisma.task.findMany({
      where: {
        completedAt: null,
        [marker]: null,
        dueDate,
        assignees: { some: {} },
        board: { project: { archived: false } },
      },
      select: taskSelect,
      take: 500,
    });

    let sent = 0;
    for (const task of tasks) {
      // marca antes de avisar: outra instância rodando junto não duplica
      const { count } = await this.prisma.task.updateMany({
        where: { id: task.id, [marker]: null },
        data: { [marker]: now },
      });
      if (count === 0) continue;
      this.notifications.notify(
        type,
        null,
        task.assignees.map((a) => a.userId),
        {
          ...taskEventData(task, task.board.project),
          dueDate: task.dueDate!.toISOString(),
        },
      );
      sent++;
    }
    if (sent) this.logger.log(`${sent} aviso(s) ${type} enviados`);
    return sent;
  }
}
