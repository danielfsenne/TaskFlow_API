import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DueRemindersService } from './due-reminders.service';

const REMINDERS_QUEUE = 'reminders';
const DUE_SOON_JOB = 'due-soon';

@Processor(REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  constructor(private readonly reminders: DueRemindersService) {
    super();
  }

  async process() {
    const now = new Date();
    return (
      (await this.reminders.sendDueSoon(now)) +
      (await this.reminders.sendOverdue(now))
    );
  }
}

// agenda a varredura periódica; com várias instâncias, o BullMQ roda uma vez só
@Injectable()
export class RemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  // sem await: com o Redis fora do ar, a API não pode ficar presa na subida
  onModuleInit() {
    void this.schedule();
  }

  private async schedule() {
    const minutes = this.config.get<number>('REMINDERS_INTERVAL_MINUTES', 15);
    try {
      if (minutes <= 0) {
        await this.queue.removeJobScheduler(DUE_SOON_JOB);
        return;
      }
      await this.queue.upsertJobScheduler(
        DUE_SOON_JOB,
        { every: minutes * 60_000 },
        {
          name: DUE_SOON_JOB,
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      );
    } catch (e) {
      // sem Redis a API sobe mesmo assim; os lembretes voltam quando ele voltar
      this.logger.error(
        `Não foi possível agendar os lembretes: ${(e as Error).message}`,
      );
    }
  }
}

@Module({
  imports: [
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
    NotificationsModule,
    MailModule,
  ],
  providers: [DueRemindersService, RemindersProcessor, RemindersScheduler],
})
export class RemindersModule {}
