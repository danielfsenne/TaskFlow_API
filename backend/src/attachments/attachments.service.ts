import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { FileStorage } from '../storage/file-storage';
import { TaskAccessService } from '../tasks/task-access.service';
import {
  ActivityType,
  TaskActivityService,
} from '../tasks/task-activity.service';

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_TASK = 20;
const PREFIX = 'attachments';
const key = (storedName: string) => `${PREFIX}/${storedName}`;
// curto: quem perde o acesso perde também o link logo depois
const LINK_TTL_SECONDS = 5 * 60;
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
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
    private readonly activity: TaskActivityService,
    private readonly realtime: RealtimeEmitter,
    private readonly storage: FileStorage,
  ) {}

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
    const mimeType = file.mimetype || 'application/octet-stream';
    await this.storage.put(key(storedName), file.buffer, mimeType);

    const attachment = await this.prisma.attachment.create({
      data: {
        taskId,
        uploadedById: userId,
        fileName,
        storedName,
        mimeType,
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

  async link(id: string, userId: string) {
    const attachment = await this.findReadable(id, userId);
    const inline = INLINE_TYPES.includes(attachment.mimeType);
    const url = await this.storage.signedUrl(key(attachment.storedName), {
      fileName: attachment.fileName,
      contentType: inline ? attachment.mimeType : 'application/octet-stream',
      inline,
      expiresInSeconds: LINK_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: url
        ? new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString()
        : null,
    };
  }

  private async findReadable(id: string, userId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado');
    await this.taskAccess.getAccess(attachment.taskId, userId).catch(() => {
      throw new NotFoundException('Anexo não encontrado');
    });
    return attachment;
  }

  async file(id: string, userId: string) {
    const attachment = await this.findReadable(id, userId);
    const stored = await this.storage.get(key(attachment.storedName));
    if (!stored) throw new NotFoundException('Arquivo não encontrado');
    return {
      ...attachment,
      ...stored,
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
    await this.storage
      .delete(key(attachment.storedName))
      .catch(() => undefined);
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
  async sweepOrphans(now = Date.now()): Promise<number> {
    const old: string[] = [];
    try {
      for await (const entry of this.storage.list(PREFIX)) {
        if (now - entry.modifiedAt.getTime() >= ORPHAN_MIN_AGE_MS) {
          old.push(entry.key.slice(PREFIX.length + 1));
        }
      }
    } catch (e) {
      this.logger.warn(`Limpeza de anexos adiada: ${(e as Error).message}`);
      return 0;
    }
    let removed = 0;
    // em lotes, para não montar um IN gigante
    for (let i = 0; i < old.length; i += 500) {
      const batch = old.slice(i, i + 500);
      const known = new Set(
        (
          await this.prisma.attachment.findMany({
            where: { storedName: { in: batch } },
            select: { storedName: true },
          })
        ).map((a) => a.storedName),
      );
      for (const name of batch) {
        if (known.has(name)) continue;
        await this.storage.delete(key(name)).catch(() => undefined);
        removed++;
      }
    }
    if (removed) this.logger.log(`${removed} anexo(s) órfão(s) removido(s)`);
    return removed;
  }
}
