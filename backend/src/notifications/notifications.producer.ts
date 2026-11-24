import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATIONS_QUEUE,
  NotificationJob,
  NotificationType,
} from './notification-types';

// sem Redis o ioredis segura o comando em memória indefinidamente
const ENQUEUE_TIMEOUT_MS = 3000;
const RETRY_EVERY_MS = 30_000;
const RETRY_BATCH = 100;

@Injectable()
export class NotificationsProducer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProducer.name);
  private timer?: NodeJS.Timeout;
  private flushing = false;

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flushPending(), RETRY_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  notify(
    type: NotificationType,
    actorId: string | null,
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
    const id = randomUUID();
    this.enqueue(id, job).catch(async (e: Error) => {
      this.logger.warn(
        `Notificação ${type} guardada para reenvio: ${e.message}`,
      );
      await this.prisma.pendingNotification
        .create({ data: { id, ...job, data: data as Prisma.InputJsonValue } })
        .catch((err: Error) =>
          this.logger.error(`Notificação ${type} perdida: ${err.message}`),
        );
    });
  }

  // reenvia as guardadas, das mais antigas; para no primeiro erro
  async flushPending(): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let sent = 0;
    try {
      const pending = await this.prisma.pendingNotification.findMany({
        orderBy: { createdAt: 'asc' },
        take: RETRY_BATCH,
      });
      for (const p of pending) {
        await this.enqueue(p.id, {
          type: p.type as NotificationType,
          actorId: p.actorId,
          recipientIds: p.recipientIds,
          data: p.data as Record<string, unknown>,
        });
        await this.prisma.pendingNotification.delete({ where: { id: p.id } });
        sent++;
      }
    } catch (e) {
      this.logger.warn(
        `Reenvio de notificações adiado: ${(e as Error).message}`,
      );
    } finally {
      this.flushing = false;
    }
    return sent;
  }

  // jobId fixo: se o envio "atrasado" também chegar, o BullMQ não duplica
  private async enqueue(jobId: string, job: NotificationJob) {
    let timeout: NodeJS.Timeout | undefined;
    const add = this.queue.add(job.type, job, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    try {
      await Promise.race([
        add,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis não respondeu')),
            ENQUEUE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      add.catch(() => undefined);
    }
  }
}
