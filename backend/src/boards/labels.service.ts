import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { RealtimeEvent, RealtimeEventName } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { BoardAccessService } from './board-access.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

export const MAX_LABELS_PER_PROJECT = 50;
export const labelSelect = { id: true, name: true, color: true } as const;

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly projectAccess: ProjectAccessService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  // as rotas continuam pelo quadro; a etiqueta vale para o projeto inteiro
  async list(boardId: string, userId: string) {
    const { board } = await this.access.getBoardAccess(boardId, userId);
    return this.prisma.label.findMany({
      where: { projectId: board.projectId },
      select: labelSelect,
      orderBy: { name: 'asc' },
    });
  }

  async create(boardId: string, userId: string, dto: CreateLabelDto) {
    const { board } = await this.access.getWritableBoard(boardId, userId);
    const { projectId } = board;
    const count = await this.prisma.label.count({ where: { projectId } });
    if (count >= MAX_LABELS_PER_PROJECT) {
      throw new BadRequestException(
        `Um projeto pode ter no máximo ${MAX_LABELS_PER_PROJECT} etiquetas`,
      );
    }
    const label = await this.unique(() =>
      this.prisma.label.create({
        data: { projectId, ...dto },
        select: labelSelect,
      }),
    );
    await this.toBoards(projectId, RealtimeEvent.LabelCreated, userId, {
      label,
    });
    return label;
  }

  async update(id: string, userId: string, dto: UpdateLabelDto) {
    const { projectId } = await this.writable(id, userId);
    const label = await this.unique(() =>
      this.prisma.label.update({
        where: { id },
        data: dto,
        select: labelSelect,
      }),
    );
    await this.toBoards(projectId, RealtimeEvent.LabelUpdated, userId, {
      label,
    });
    return label;
  }

  // sai também de todas as tarefas (cascade em task_labels)
  async remove(id: string, userId: string) {
    const { projectId } = await this.writable(id, userId);
    await this.prisma.label.delete({ where: { id } });
    await this.toBoards(projectId, RealtimeEvent.LabelDeleted, userId, {
      labelId: id,
    });
  }

  private async toBoards(
    projectId: string,
    event: RealtimeEventName,
    actorId: string,
    data: Record<string, unknown>,
  ) {
    const boards = await this.prisma.board.findMany({
      where: { projectId },
      select: { id: true },
    });
    for (const { id } of boards) {
      this.realtime.toBoard(id, event, actorId, data);
    }
  }

  private async writable(id: string, userId: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Etiqueta não encontrada');
    const { project } = await this.projectAccess
      .getAccess(label.projectId, userId)
      .catch((e) => {
        throw e instanceof NotFoundException
          ? new NotFoundException('Etiqueta não encontrada')
          : e;
      });
    this.projectAccess.assertNotArchived(project);
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
