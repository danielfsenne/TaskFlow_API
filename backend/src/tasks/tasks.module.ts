import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [ProjectsModule, BoardsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
