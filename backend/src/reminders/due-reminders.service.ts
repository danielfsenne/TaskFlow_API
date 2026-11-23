import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { PrismaService } from '../prisma/prisma.service';
import { taskEventData } from '../tasks/tasks.service';

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DueRemindersService {
  private readonly logger = new Logger(DueRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsProducer,
  ) {}

  // avisa os responsáveis das tarefas abertas que vencem nas próximas 24 h
  async sendDueSoon(now = new Date()): Promise<number> {
    const tasks = await this.prisma.task.findMany({
      where: {
        completedAt: null,
        dueReminderSentAt: null,
        dueDate: { gt: now, lte: new Date(now.getTime() + DUE_SOON_WINDOW_MS) },
        assignees: { some: {} },
        board: { project: { archived: false } },
      },
      select: {
        id: true,
        title: true,
        boardId: true,
        dueDate: true,
        assignees: { select: { userId: true } },
        board: {
          select: {
            project: {
              select: { id: true, name: true, organizationId: true },
            },
          },
        },
      },
      take: 500,
    });

    let sent = 0;
    for (const task of tasks) {
      // marca antes de avisar: outra instância rodando junto não duplica
      const { count } = await this.prisma.task.updateMany({
        where: { id: task.id, dueReminderSentAt: null },
        data: { dueReminderSentAt: now },
      });
      if (count === 0) continue;
      this.notifications.notify(
        NotificationType.TaskDueSoon,
        null,
        task.assignees.map((a) => a.userId),
        {
          ...taskEventData(task, task.board.project),
          dueDate: task.dueDate!.toISOString(),
        },
      );
      sent++;
    }
    if (sent) this.logger.log(`${sent} lembrete(s) de prazo enviados`);
    return sent;
  }
}
