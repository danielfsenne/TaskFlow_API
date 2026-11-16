import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTIFICATIONS_QUEUE } from './notification-types';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsProducer } from './notifications.producer';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProducer,
    NotificationsProcessor,
  ],
  exports: [NotificationsProducer],
})
export class NotificationsModule {}
