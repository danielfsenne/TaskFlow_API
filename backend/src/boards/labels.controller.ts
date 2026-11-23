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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';
import { LabelsService } from './labels.service';

@ApiTags('labels')
@ApiBearerAuth()
@Controller()
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get('boards/:boardId/labels')
  @ApiOperation({ summary: 'Etiquetas do quadro' })
  list(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.labels.list(boardId, user.id);
  }

  @Post('boards/:boardId/labels')
  @ApiOperation({ summary: 'Cria uma etiqueta no quadro' })
  create(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLabelDto,
  ) {
    return this.labels.create(boardId, user.id, dto);
  }

  @Patch('labels/:id')
  @ApiOperation({ summary: 'Renomeia ou troca a cor da etiqueta' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labels.update(id, user.id, dto);
  }

  @Delete('labels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui a etiqueta e a tira das tarefas' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.labels.remove(id, user.id);
  }
}
