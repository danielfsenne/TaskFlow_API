import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../auth/types/auth-user';
import {
  AVATAR_FILE_PATTERN,
  AVATAR_MAX_BYTES,
  AvatarStorage,
} from './avatar-storage';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatars: AvatarStorage,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza o nome' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.update(user.id, { name: dto.name });
  }

  @Put('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Envia a foto de perfil (PNG, JPEG ou WebP, até 2 MB)',
  })
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Envie a imagem no campo "file"');
    return this.usersService.setAvatar(user.id, file.buffer);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove a foto de perfil' })
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.usersService.setAvatar(user.id, null);
  }

  @Public()
  @Get('avatars/:file')
  @ApiOperation({ summary: 'Arquivo da foto de perfil' })
  avatar(@Param('file') file: string, @Res() res: Response) {
    if (!AVATAR_FILE_PATTERN.test(file)) {
      throw new NotFoundException('Imagem não encontrada');
    }
    // o nome muda a cada envio, então o arquivo nunca muda: cache longo
    res.sendFile(
      file,
      {
        root: this.avatars.dir,
        maxAge: '365d',
        immutable: true,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      },
      (err) => {
        if (err && !res.headersSent) {
          res
            .status(404)
            .json({ statusCode: 404, message: 'Imagem não encontrada' });
        }
      },
    );
  }
}
