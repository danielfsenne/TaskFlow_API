import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  const prisma = {
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const taskAccess = {
    getAccess: jest.fn(),
    getWritable: jest.fn(),
    isManager: jest.fn(),
  };
  let service: CommentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommentsService(
      prisma as unknown as PrismaService,
      taskAccess as unknown as TaskAccessService,
    );
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c1',
      taskId: 't1',
      authorId: 'autor',
    });
    taskAccess.getWritable.mockResolvedValue({});
  });

  describe('findAll', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}` }));

    it('indica a próxima página quando há mais itens', async () => {
      prisma.comment.findMany.mockResolvedValue(rows(3));
      const res = await service.findAll('t1', 'u', { limit: 2 });
      expect(res.items).toHaveLength(2);
      expect(res.nextCursor).toBe('c2');
    });

    it('nextCursor é null na última página', async () => {
      prisma.comment.findMany.mockResolvedValue(rows(2));
      const res = await service.findAll('t1', 'u', { limit: 2 });
      expect(res.nextCursor).toBeNull();
    });

    it('continua a partir do cursor, pulando ele', async () => {
      prisma.comment.findMany.mockResolvedValue([]);
      await service.findAll('t1', 'u', { limit: 10, cursor: 'c5' });
      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'c5' }, skip: 1, take: 11 }),
      );
    });
  });

  it('só o autor edita', async () => {
    await expect(
      service.update('c1', 'outro', { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.update('c1', 'autor', { content: 'x' });
    expect(prisma.comment.update).toHaveBeenCalledTimes(1);
  });

  it('quem gerencia o projeto pode excluir comentário de outro', async () => {
    taskAccess.isManager.mockReturnValue(true);
    await service.remove('c1', 'admin');
    expect(prisma.comment.delete).toHaveBeenCalled();
  });

  it('membro comum não exclui comentário de outro', async () => {
    taskAccess.isManager.mockReturnValue(false);
    await expect(service.remove('c1', 'outro')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  it('não membro recebe 404 com mensagem de comentário', async () => {
    taskAccess.getWritable.mockRejectedValue(
      new NotFoundException('Tarefa não encontrada'),
    );
    await expect(service.remove('c1', 'estranho')).rejects.toThrow(
      'Comentário não encontrado',
    );
  });
});
