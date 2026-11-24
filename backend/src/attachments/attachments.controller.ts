import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { AuthUser } from '../auth/types/auth-user';
import {
  ATTACHMENT_MAX_BYTES,
  AttachmentsService,
} from './attachments.service';
import { UuidPipe } from '../common/validation';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller()
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('tasks/:taskId/attachments')
  @ApiOperation({ summary: 'Anexos da tarefa' })
  list(
    @Param('taskId', UuidPipe) taskId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.list(taskId, user.id);
  }

  @Post('tasks/:taskId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Anexa um arquivo à tarefa (até 10 MB)' })
  upload(
    @Param('taskId', UuidPipe) taskId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Envie o arquivo no campo "file"');
    return this.attachments.upload(taskId, user.id, file);
  }

  @Get('attachments/:id/file')
  @ApiOperation({ summary: 'Conteúdo do anexo (imagens abrem, o resto baixa)' })
  async download(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const file = await this.attachments.file(id, user.id);
    // o arquivo vem de outra pessoa: nunca executa nada no nosso domínio
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Type',
      file.inline ? file.mimeType : 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.sendFile(file.path, (err) => {
      if (err && !res.headersSent) {
        res
          .status(404)
          .json({ statusCode: 404, message: 'Arquivo não encontrado' });
      }
    });
  }

  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui o anexo (quem enviou ou gerente)' })
  remove(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.remove(id, user.id);
  }
}
