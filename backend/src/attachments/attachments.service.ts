import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { TaskAccessService } from '../tasks/task-access.service';
import {
  ActivityType,
  TaskActivityService,
} from '../tasks/task-activity.service';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_TASK = 20;
const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000;
// arquivo recém-gravado ainda pode estar esperando o registro no banco
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

// só estas abrem no navegador; o resto sempre baixa
export const INLINE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

const select = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true, avatarUrl: true } },
} as const;

// nome legível e seguro para guardar e devolver no download
export function cleanFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || 'arquivo';
}

@Injectable()
export class AttachmentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentsService.name);
  readonly dir: string;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
    private readonly activity: TaskActivityService,
    private readonly realtime: RealtimeEmitter,
    config: ConfigService,
  ) {
    this.dir = resolve(config.getOrThrow<string>('UPLOAD_DIR'), 'attachments');
  }

  onModuleInit() {
    this.sweepTimer = setInterval(
      () => void this.sweepOrphans(),
      SWEEP_EVERY_MS,
    );
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  async list(taskId: string, userId: string) {
    await this.taskAccess.getAccess(taskId, userId);
    return this.prisma.attachment.findMany({
      where: { taskId },
      select,
      orderBy: { createdAt: 'asc' },
    });
  }

  async upload(taskId: string, userId: string, file: Express.Multer.File) {
    const { task } = await this.taskAccess.getWritable(taskId, userId);
    const count = await this.prisma.attachment.count({ where: { taskId } });
    if (count >= MAX_PER_TASK) {
      throw new BadRequestException(
        `Uma tarefa pode ter no máximo ${MAX_PER_TASK} anexos`,
      );
    }

    // o nome original vem em latin1 pelo multer; os acentos precisam disso
    const fileName = cleanFileName(
      Buffer.from(file.originalname, 'latin1').toString('utf8'),
    );
    const ext = extname(fileName)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 10);
    const storedName = `${randomUUID()}${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, storedName), file.buffer);

    const attachment = await this.prisma.attachment.create({
      data: {
        taskId,
        uploadedById: userId,
        fileName,
        storedName,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
      },
      select,
    });
    await this.activity.record(taskId, userId, [
      { type: ActivityType.AttachmentAdded, data: { name: fileName } },
    ]);
    this.realtime.toBoard(
      task.boardId,
      RealtimeEvent.AttachmentCreated,
      userId,
      {
        taskId,
        attachment,
      },
    );
    return attachment;
  }

  async file(id: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');
    await this.taskAccess.getAccess(attachment.taskId, userId).catch(() => {
      throw new NotFoundException('Anexo não encontrado');
    });
    return {
      ...attachment,
      path: join(this.dir, attachment.storedName),
      inline: INLINE_TYPES.includes(attachment.mimeType),
    };
  }

  // quem enviou ou quem gerencia o projeto
  async remove(id: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');
    const access = await this.taskAccess
      .getWritable(attachment.taskId, userId)
      .catch((e) => {
        throw e instanceof NotFoundException
          ? new NotFoundException('Anexo não encontrado')
          : e;
      });
    if (
      attachment.uploadedById !== userId &&
      !this.taskAccess.isManager(access, userId)
    ) {
      throw new ForbiddenException(
        'Só quem enviou ou quem gerencia o projeto pode excluir o anexo',
      );
    }

    await this.prisma.attachment.delete({ where: { id } });
    await unlink(join(this.dir, attachment.storedName)).catch(() => undefined);
    await this.activity.record(attachment.taskId, userId, [
      {
        type: ActivityType.AttachmentRemoved,
        data: { name: attachment.fileName },
      },
    ]);
    this.realtime.toBoard(
      access.task.boardId,
      RealtimeEvent.AttachmentDeleted,
      userId,
      { taskId: attachment.taskId, attachmentId: id },
    );
  }

  // apagar quadro/projeto/organização remove os registros em cascata;
  // os arquivos que ficaram sem registro saem aqui
  async sweepOrphans(): Promise<number> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return 0;
    }
    if (!files.length) return 0;
    const known = new Set(
      (
        await this.prisma.attachment.findMany({
          where: { storedName: { in: files } },
          select: { storedName: true },
        })
      ).map((a) => a.storedName),
    );
    let removed = 0;
    for (const name of files) {
      if (known.has(name)) continue;
      const path = join(this.dir, name);
      const info = await stat(path).catch(() => null);
      if (!info || Date.now() - info.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
      await unlink(path).catch(() => undefined);
      removed++;
    }
    if (removed) this.logger.log(`${removed} anexo(s) órfão(s) removido(s)`);
    return removed;
  }
}
