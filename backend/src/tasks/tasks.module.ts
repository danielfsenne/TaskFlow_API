import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { ProjectsModule } from '../projects/projects.module';
import { TaskAccessService } from './task-access.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ProjectsModule, BoardsModule],
  controllers: [TasksController],
  providers: [TasksService, TaskAccessService],
  exports: [TaskAccessService],
})
export class TasksModule {}
