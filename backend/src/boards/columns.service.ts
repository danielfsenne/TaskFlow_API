import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { syncBoardCompletion } from '../common/completion';
import {
  changedPositions,
  planMove,
  positionBetween,
} from '../common/position';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent } from '../realtime/realtime-events';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { BoardAccessService } from './board-access.service';
import {
  CreateColumnDto,
  MoveColumnDto,
  UpdateColumnDto,
} from './dto/board.dto';

const MAX_COLUMNS = 20;

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(boardId: string, userId: string, dto: CreateColumnDto) {
    await this.access.getWritableBoard(boardId, userId);

    const [count, last] = await Promise.all([
      this.prisma.boardColumn.count({ where: { boardId } }),
      this.prisma.boardColumn.findFirst({
        where: { boardId },
        orderBy: { position: 'desc' },
        select: { position: true },
      }),
    ]);
    if (count >= MAX_COLUMNS) {
      throw new BadRequestException(
        `Um quadro pode ter no máximo ${MAX_COLUMNS} colunas`,
      );
    }

    const column = await this.prisma.$transaction(async (tx) => {
      const column = await tx.boardColumn.create({
        data: {
          boardId,
          name: dto.name,
          position: positionBetween(last?.position ?? null, null),
        },
      });
      await syncBoardCompletion(tx, boardId);
      return column;
    });
    this.realtime.toBoard(boardId, RealtimeEvent.ColumnCreated, userId, {
      column,
    });
    return column;
  }

  async update(id: string, userId: string, dto: UpdateColumnDto) {
    const { board } = await this.access.getWritableColumn(id, userId);
    const column = await this.prisma.boardColumn.update({
      where: { id },
      data: dto,
    });
    this.realtime.toBoard(board.id, RealtimeEvent.ColumnUpdated, userId, {
      column,
    });
    return column;
  }

  async move(id: string, userId: string, dto: MoveColumnDto) {
    const { board } = await this.access.getWritableColumn(id, userId);
    if (dto.afterColumnId === id) {
      throw new BadRequestException(
        'Uma coluna não pode ficar depois de si mesma',
      );
    }

    const { column, positions } = await this.prisma.$transaction(async (tx) => {
      const others = await tx.boardColumn.findMany({
        where: { boardId: board.id, id: { not: id } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });

      const plan = planMove(others, dto.afterColumnId, id);
      if (!plan) {
        throw new NotFoundException(
          'Coluna de referência não encontrada neste quadro',
        );
      }

      const positions = changedPositions(plan, id);
      for (const { id: columnId, position } of positions) {
        await tx.boardColumn.update({
          where: { id: columnId },
          data: { position },
        });
      }
      await syncBoardCompletion(tx, board.id);
      const column = await tx.boardColumn.findUniqueOrThrow({
        where: { id },
      });
      return { column, positions };
    });

    this.realtime.toBoard(board.id, RealtimeEvent.ColumnMoved, userId, {
      columnId: id,
      positions,
    });
    return column;
  }

  async remove(id: string, userId: string) {
    const { board } = await this.access.getWritableColumn(id, userId);
    const tasks = await this.prisma.task.count({ where: { columnId: id } });
    if (tasks > 0) {
      throw new ConflictException(
        'A coluna tem tarefas; mova-as antes de excluí-la',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.boardColumn.delete({ where: { id } });
      await syncBoardCompletion(tx, board.id);
    });
    this.realtime.toBoard(board.id, RealtimeEvent.ColumnDeleted, userId, {
      columnId: id,
    });
  }
}
