import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { ColumnsService } from './columns.service';

@Module({
  imports: [ProjectsModule],
  controllers: [BoardsController],
  providers: [BoardsService, ColumnsService, BoardAccessService],
  exports: [BoardAccessService],
})
export class BoardsModule {}
