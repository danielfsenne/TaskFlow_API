import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import { BoardsService } from './boards.service';
import { ColumnsService } from './columns.service';
import {
  CreateBoardDto,
  CreateColumnDto,
  MoveColumnDto,
  UpdateBoardDto,
  UpdateColumnDto,
} from './dto/board.dto';
import { UuidPipe } from '../common/validation';

@ApiTags('boards')
@ApiBearerAuth()
@Controller()
export class BoardsController {
  constructor(
    private readonly boards: BoardsService,
    private readonly columns: ColumnsService,
  ) {}

  @Post('projects/:projectId/boards')
  @ApiOperation({
    summary: 'Cria um quadro com colunas iniciais (qualquer membro)',
  })
  create(
    @Param('projectId', UuidPipe) projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBoardDto,
  ) {
    return this.boards.create(projectId, user.id, dto);
  }

  @Get('projects/:projectId/boards')
  findAll(
    @Param('projectId', UuidPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.boards.findAll(projectId, user.id);
  }

  @Get('boards/:id')
  @ApiOperation({ summary: 'Quadro com as colunas em ordem' })
  findOne(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.boards.findOne(id, user.id);
  }

  @Patch('boards/:id')
  update(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boards.update(id, user.id, dto);
  }

  @Delete('boards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui o quadro e suas tarefas (criador do projeto ou ADMIN+)',
  })
  remove(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.boards.remove(id, user.id);
  }

  @Post('boards/:boardId/columns')
  @ApiOperation({ summary: 'Adiciona uma coluna no fim do quadro' })
  createColumn(
    @Param('boardId', UuidPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columns.create(boardId, user.id, dto);
  }

  @Patch('columns/:id')
  updateColumn(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columns.update(id, user.id, dto);
  }

  @Patch('columns/:id/move')
  @ApiOperation({ summary: 'Reordena a coluna dentro do quadro' })
  moveColumn(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MoveColumnDto,
  ) {
    return this.columns.move(id, user.id, dto);
  }

  @Delete('columns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui uma coluna vazia' })
  removeColumn(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.columns.remove(id, user.id);
  }
}
