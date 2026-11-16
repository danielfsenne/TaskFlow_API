import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  const prisma = {
    comment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    taskAssignee: { findMany: jest.fn() },
  };
  const taskAccess = {
    getAccess: jest.fn(),
    getWritable: jest.fn(),
    isManager: jest.fn(),
  };
  const notifications = { notify: jest.fn() };
  let service: CommentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommentsService(
      prisma as unknown as PrismaService,
      taskAccess as unknown as TaskAccessService,
      notifications as unknown as NotificationsProducer,
      { toBoard: jest.fn() } as unknown as RealtimeEmitter,
    );
    prisma.comment.findUnique.mockResolvedValue({
      id: 'c1',
      taskId: 't1',
      authorId: 'autor',
    });
    taskAccess.getWritable.mockResolvedValue({ task: { boardId: 'b1' } });
  });

  it('notifica o autor da tarefa e os responsáveis', async () => {
    taskAccess.getWritable.mockResolvedValue({
      task: { id: 't1', title: 'T', boardId: 'b1', createdById: 'criador' },
      project: { id: 'p1', name: 'P', organizationId: 'o1' },
    });
    prisma.comment.create.mockResolvedValue({
      id: 'c9',
      content: 'x'.repeat(300),
    });
    prisma.taskAssignee.findMany.mockResolvedValue([
      { userId: 'resp1' },
      { userId: 'quem-comenta' },
    ]);

    await service.create('t1', 'quem-comenta', { content: 'x'.repeat(300) });

    const [type, actor, recipients, data] = notifications.notify.mock.calls[0];
    expect(type).toBe(NotificationType.TaskCommented);
    expect(actor).toBe('quem-comenta');
    // O produtor filtra o próprio autor; aqui só conferimos quem é candidato.
    expect(recipients).toEqual(['criador', 'resp1', 'quem-comenta']);
    expect(data).toMatchObject({ taskId: 't1', commentId: 'c9' });
    expect(data.excerpt.length).toBe(140);
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
