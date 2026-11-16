import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE, NotificationJob } from './notification-types';

/** Worker que grava as notificações enfileiradas, uma linha por destinatário. */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<number> {
    const { type, actorId, recipientIds, data } = job.data;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, avatarUrl: true },
    });

    // Usuários podem ter sido excluídos entre o evento e o processamento.
    const existing = await this.prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true },
    });

    const payload = { ...data, actor };
    const { count } = await this.prisma.notification.createMany({
      data: existing.map(({ id }) => ({ userId: id, type, payload })),
    });
    return count;
  }
}
