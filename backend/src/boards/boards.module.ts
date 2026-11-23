import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { ColumnsService } from './columns.service';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';

@Module({
  imports: [ProjectsModule],
  controllers: [BoardsController, LabelsController],
  providers: [BoardsService, ColumnsService, LabelsService, BoardAccessService],
  exports: [BoardAccessService],
})
export class BoardsModule {}
