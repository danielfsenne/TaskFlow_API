import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Painel pessoal: minhas tarefas abertas e minhas organizações',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.dashboard.me(user.id);
  }

  @Get('organizations/:orgId/dashboard')
  @ApiOperation({ summary: 'Indicadores da organização, por projeto' })
  organization(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.organization(orgId, user.id);
  }

  @Get('projects/:projectId/dashboard')
  @ApiOperation({ summary: 'Indicadores do projeto, por quadro' })
  project(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.project(projectId, user.id);
  }
}
