import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { BoardAccessService } from './board-access.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

export const MAX_LABELS_PER_BOARD = 30;
export const labelSelect = { id: true, name: true, color: true } as const;

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async list(boardId: string, userId: string) {
    await this.access.getBoardAccess(boardId, userId);
    return this.prisma.label.findMany({
      where: { boardId },
      select: labelSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(boardId: string, userId: string, dto: CreateLabelDto) {
    await this.access.getWritableBoard(boardId, userId);
    const count = await this.prisma.label.count({ where: { boardId } });
    if (count >= MAX_LABELS_PER_BOARD) {
      throw new BadRequestException(
        `Um quadro pode ter no máximo ${MAX_LABELS_PER_BOARD} etiquetas`,
      );
    }
    const label = await this.unique(() =>
      this.prisma.label.create({
        data: { boardId, ...dto },
        select: labelSelect,
      }),
    );
    this.realtime.toBoard(boardId, RealtimeEvent.LabelCreated, userId, {
      label,
    });
    return label;
  }

  async update(id: string, userId: string, dto: UpdateLabelDto) {
    const { boardId } = await this.writable(id, userId);
    const label = await this.unique(() =>
      this.prisma.label.update({
        where: { id },
        data: dto,
        select: labelSelect,
      }),
    );
    this.realtime.toBoard(boardId, RealtimeEvent.LabelUpdated, userId, {
      label,
    });
    return label;
  }

  // sai também de todas as tarefas (cascade em task_labels)
  async remove(id: string, userId: string) {
    const { boardId } = await this.writable(id, userId);
    await this.prisma.label.delete({ where: { id } });
    this.realtime.toBoard(boardId, RealtimeEvent.LabelDeleted, userId, {
      labelId: id,
    });
  }

  private async writable(id: string, userId: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Etiqueta não encontrada');
    await this.access.getWritableBoard(label.boardId, userId).catch((e) => {
      throw e instanceof NotFoundException
        ? new NotFoundException('Etiqueta não encontrada')
        : e;
    });
    return label;
  }

  private async unique<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma etiqueta com esse nome');
      }
      throw e;
    }
  }
}
