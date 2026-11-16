import { Injectable, NotFoundException } from '@nestjs/common';
import { Board, BoardColumn } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectAccess,
  ProjectAccessService,
} from '../projects/project-access.service';

export interface BoardAccess extends ProjectAccess {
  board: Board;
}

export interface ColumnAccess extends BoardAccess {
  column: BoardColumn;
}

/** Acesso a quadros e colunas herda o acesso ao projeto (404 para não membros). */
@Injectable()
export class BoardAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getBoardAccess(boardId: string, userId: string): Promise<BoardAccess> {
    const found = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { project: true },
    });
    if (!found) throw new NotFoundException('Quadro não encontrado');

    const { project, ...board } = found;
    const access = await this.notFoundAs(
      this.projectAccess.forProject(project, userId),
      'Quadro não encontrado',
    );
    return { ...access, board };
  }

  async getColumnAccess(
    columnId: string,
    userId: string,
  ): Promise<ColumnAccess> {
    const found = await this.prisma.boardColumn.findUnique({
      where: { id: columnId },
      include: { board: { include: { project: true } } },
    });
    if (!found) throw new NotFoundException('Coluna não encontrada');

    const {
      board: { project, ...board },
      ...column
    } = found;
    const access = await this.notFoundAs(
      this.projectAccess.forProject(project, userId),
      'Coluna não encontrada',
    );
    return { ...access, board, column };
  }

  /** Acesso para alterar quadro/colunas: qualquer membro, projeto ativo. */
  async getWritableBoard(boardId: string, userId: string) {
    const access = await this.getBoardAccess(boardId, userId);
    this.projectAccess.assertNotArchived(access.project);
    return access;
  }

  async getWritableColumn(columnId: string, userId: string) {
    const access = await this.getColumnAccess(columnId, userId);
    this.projectAccess.assertNotArchived(access.project);
    return access;
  }

  /** Troca a mensagem do 404 para refletir o recurso pedido. */
  private async notFoundAs<T>(promise: Promise<T>, message: string) {
    try {
      return await promise;
    } catch (e) {
      if (e instanceof NotFoundException) throw new NotFoundException(message);
      throw e;
    }
  }
}
