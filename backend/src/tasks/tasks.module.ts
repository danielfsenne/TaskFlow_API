import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ProjectsModule, BoardsModule, NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskAccessService, TaskActivityService],
  exports: [TaskAccessService],
})
export class TasksModule {}
