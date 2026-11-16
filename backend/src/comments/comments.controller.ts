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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import { CommentsService } from './comments.service';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
} from './dto/comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post('tasks/:taskId/comments')
  create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(taskId, user.id, dto);
  }

  @Get('tasks/:taskId/comments')
  @ApiOperation({ summary: 'Comentários da tarefa, paginados por cursor' })
  findAll(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.comments.findAll(taskId, user.id, query);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Edita o comentário (só o autor)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(id, user.id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Exclui o comentário (autor, criador do projeto ou ADMIN+)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.remove(id, user.id);
  }
}
