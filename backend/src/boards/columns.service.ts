import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { planMove, positionBetween } from '../common/position';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  /** Nova coluna entra no fim do quadro. */
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

    return this.prisma.boardColumn.create({
      data: {
        boardId,
        name: dto.name,
        position: positionBetween(last?.position ?? null, null),
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateColumnDto) {
    await this.access.getWritableColumn(id, userId);
    return this.prisma.boardColumn.update({ where: { id }, data: dto });
  }

  /**
   * Coloca a coluna logo depois de `afterColumnId` (ou no início, se null).
   * Normalmente só a coluna movida muda de posição; se faltar espaço entre os
   * vizinhos, o quadro inteiro é renumerado.
   */
  async move(id: string, userId: string, dto: MoveColumnDto) {
    const { board } = await this.access.getWritableColumn(id, userId);
    if (dto.afterColumnId === id) {
      throw new BadRequestException(
        'Uma coluna não pode ficar depois de si mesma',
      );
    }

    return this.prisma.$transaction(async (tx) => {
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

      if (plan.kind === 'single') {
        return tx.boardColumn.update({
          where: { id },
          data: { position: plan.position },
        });
      }

      for (const { id: columnId, position } of plan.updates) {
        await tx.boardColumn.update({
          where: { id: columnId },
          data: { position },
        });
      }
      return tx.boardColumn.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Só remove colunas vazias, para não apagar tarefas por acidente. */
  async remove(id: string, userId: string) {
    await this.access.getWritableColumn(id, userId);
    const tasks = await this.prisma.task.count({ where: { columnId: id } });
    if (tasks > 0) {
      throw new ConflictException(
        'A coluna tem tarefas; mova-as antes de excluí-la',
      );
    }
    await this.prisma.boardColumn.delete({ where: { id } });
  }
}
