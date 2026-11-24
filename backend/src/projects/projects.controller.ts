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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';
import { UuidPipe } from '../common/validation';

@ApiTags('projects')
@ApiBearerAuth()
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post('organizations/:orgId/projects')
  @ApiOperation({ summary: 'Cria um projeto na organização (qualquer membro)' })
  create(
    @Param('orgId', UuidPipe) orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(orgId, user.id, dto);
  }

  @Get('organizations/:orgId/projects')
  @ApiOperation({ summary: 'Lista os projetos da organização' })
  findAll(
    @Param('orgId', UuidPipe) orgId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListProjectsQueryDto,
  ) {
    return this.projects.findAll(orgId, user.id, query);
  }

  @Get('projects/:id')
  findOne(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projects.findOne(id, user.id);
  }

  @Patch('projects/:id')
  @ApiOperation({
    summary: 'Atualiza ou arquiva o projeto (criador ou ADMIN+)',
  })
  update(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(id, user.id, dto);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui o projeto (ADMIN+)' })
  remove(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projects.remove(id, user.id);
  }
}
