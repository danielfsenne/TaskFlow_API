import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BoardAccessService } from './board-access.service';
import { ColumnsService } from './columns.service';

describe('ColumnsService', () => {
  const tx = {
    boardColumn: {
      findMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    task: { count: jest.fn() },
    boardColumn: { delete: jest.fn() },
  };
  const access = { getWritableColumn: jest.fn() };
  let service: ColumnsService;

  beforeEach(() => {
    jest.clearAllMocks();
    access.getWritableColumn.mockResolvedValue({ board: { id: 'b1' } });
    service = new ColumnsService(
      prisma as unknown as PrismaService,
      access as unknown as BoardAccessService,
      { toBoard: jest.fn() } as unknown as RealtimeEmitter,
    );
  });

  // Colunas restantes do quadro, sem a que está sendo movida (c).
  const others = [
    { id: 'a', position: 1000 },
    { id: 'b', position: 2000 },
    { id: 'd', position: 3000 },
  ];

  it('move para o início', async () => {
    tx.boardColumn.findMany.mockResolvedValue(others);
    await service.move('c', 'u', { afterColumnId: null });
    expect(tx.boardColumn.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { position: 500 },
    });
  });

  it('move para entre duas colunas', async () => {
    tx.boardColumn.findMany.mockResolvedValue(others);
    await service.move('c', 'u', { afterColumnId: 'a' });
    expect(tx.boardColumn.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { position: 1500 },
    });
  });

  it('move para o fim', async () => {
    tx.boardColumn.findMany.mockResolvedValue(others);
    await service.move('c', 'u', { afterColumnId: 'd' });
    expect(tx.boardColumn.update).toHaveBeenCalledWith({
      where: { id: 'c' },
      data: { position: 4000 },
    });
  });

  it('renumera o quadro quando não há espaço entre os vizinhos', async () => {
    tx.boardColumn.findMany.mockResolvedValue([
      { id: 'a', position: 1 },
      { id: 'b', position: 1 + 1e-7 },
    ]);
    await service.move('c', 'u', { afterColumnId: 'a' });
    const calls = tx.boardColumn.update.mock.calls.map(([arg]) => [
      arg.where.id,
      arg.data.position,
    ]);
    expect(calls).toEqual([
      ['a', 1000],
      ['c', 2000],
      ['b', 3000],
    ]);
  });

  it('rejeita coluna de referência de outro quadro', async () => {
    tx.boardColumn.findMany.mockResolvedValue(others);
    await expect(
      service.move('c', 'u', { afterColumnId: 'zzz' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita mover depois de si mesma', async () => {
    await expect(
      service.move('c', 'u', { afterColumnId: 'c' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não exclui coluna com tarefas', async () => {
    prisma.task.count.mockResolvedValue(2);
    await expect(service.remove('c', 'u')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.boardColumn.delete).not.toHaveBeenCalled();
  });

  it('propaga o bloqueio de projeto arquivado', async () => {
    access.getWritableColumn.mockRejectedValue(new ForbiddenException());
    await expect(
      service.move('c', 'u', { afterColumnId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
