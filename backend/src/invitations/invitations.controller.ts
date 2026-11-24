import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsHexadecimal, Length } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthRateLimit } from '../auth/auth-throttle';
import { AuthUser } from '../auth/types/auth-user';
import { AddMemberDto } from '../organizations/dto/organization.dto';
import { InvitationsService } from './invitations.service';
import { UuidPipe } from '../common/validation';

class TokenParam {
  @IsHexadecimal()
  @Length(64, 64)
  token!: string;
}

@ApiTags('invitations')
@ApiBearerAuth()
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  // cada convite dispara um e-mail
  @AuthRateLimit()
  @Post('organizations/:orgId/invitations')
  @ApiOperation({
    summary: 'Convida por e-mail quem ainda não tem conta (ADMIN+)',
  })
  invite(
    @Param('orgId', UuidPipe) orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AddMemberDto,
  ) {
    return this.invitations.invite(orgId, user.id, dto.email, dto.role);
  }

  @Get('organizations/:orgId/invitations')
  @ApiOperation({ summary: 'Convites pendentes (ADMIN+)' })
  list(@Param('orgId', UuidPipe) orgId: string, @CurrentUser() user: AuthUser) {
    return this.invitations.list(orgId, user.id);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancela um convite pendente (ADMIN+)' })
  revoke(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invitations.revoke(id, user.id);
  }

  @Public()
  @Get('invitations/token/:token')
  @ApiOperation({ summary: 'Dados do convite para a tela do link' })
  preview(@Param() { token }: TokenParam) {
    return this.invitations.preview(token);
  }

  @Post('invitations/token/:token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceita o convite com a conta logada' })
  accept(@Param() { token }: TokenParam, @CurrentUser() user: AuthUser) {
    return this.invitations.accept(token, user.id);
  }
}
