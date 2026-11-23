import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  MoveTaskDto,
  SetAssigneesDto,
  SetLabelsDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TaskActivityService } from './task-activity.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly activityService: TaskActivityService,
  ) {}

  @Post('boards/:boardId/tasks')
  @ApiOperation({ summary: 'Cria uma tarefa no fim da coluna' })
  create(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(boardId, user.id, dto);
  }

  @Get('boards/:boardId/tasks')
  @ApiOperation({
    summary: 'Tarefas do quadro, ordenadas por coluna e posição',
  })
  findAll(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.findAll(boardId, user.id, query);
  }

  @Get('tasks/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.findOne(id, user.id);
  }

  @Patch('tasks/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(id, user.id, dto);
  }

  @Patch('tasks/:id/move')
  @ApiOperation({ summary: 'Reordena ou troca a tarefa de coluna' })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(id, user.id, dto);
  }

  @Put('tasks/:id/assignees')
  @ApiOperation({ summary: 'Define a lista completa de responsáveis' })
  setAssignees(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetAssigneesDto,
  ) {
    return this.tasks.setAssignees(id, user.id, dto.userIds);
  }

  @Put('tasks/:id/labels')
  @ApiOperation({ summary: 'Define a lista completa de etiquetas' })
  setLabels(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetLabelsDto,
  ) {
    return this.tasks.setLabels(id, user.id, dto.labelIds);
  }

  @Get('tasks/:id/activity')
  @ApiOperation({ summary: 'Histórico de alterações (mais recentes primeiro)' })
  activity(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.activityService.list(id, user.id);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui a tarefa (autor, criador do projeto ou ADMIN+)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.remove(id, user.id);
  }
}
