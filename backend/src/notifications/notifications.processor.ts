import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { NOTIFICATIONS_QUEUE, NotificationJob } from './notification-types';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<number> {
    const { type, actorId, recipientIds, data } = job.data;

    const actor = actorId
      ? await this.prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, name: true, avatarUrl: true },
        })
      : null;

    const existing = await this.prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true },
    });

    const payload = { ...data, actor };
    const created = await this.prisma.notification.createManyAndReturn({
      data: existing.map(({ id }) => ({ userId: id, type, payload })),
    });

    for (const notification of created) {
      this.realtime.toUser(
        notification.userId,
        RealtimeEvent.NotificationCreated,
        { notification },
      );
    }
    return created.length;
  }
}
