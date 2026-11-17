import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  NotificationType,
} from './notification-types';

@Injectable()
export class NotificationsProducer {
  private readonly logger = new Logger(NotificationsProducer.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  notify(
    type: NotificationType,
    actorId: string,
    recipientIds: Iterable<string>,
    data: Record<string, unknown>,
  ): void {
    const recipients = [...new Set(recipientIds)].filter(
      (id) => id !== actorId,
    );
    if (recipients.length === 0) return;

    const job: NotificationJob = {
      type,
      actorId,
      recipientIds: recipients,
      data,
    };
    this.queue
      .add(type, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      })
      .catch((e: Error) =>
        this.logger.error(
          `Falha ao enfileirar notificação ${type}: ${e.message}`,
        ),
      );
  }
}
