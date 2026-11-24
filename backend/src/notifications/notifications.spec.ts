import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { NotificationJob, NotificationType } from './notification-types';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsProducer } from './notifications.producer';

describe('NotificationsProducer', () => {
  const queue = { add: jest.fn() };
  const pending = {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  };
  let producer: NotificationsProducer;
  const flush = () => new Promise((r) => setImmediate(r));

  beforeEach(() => {
    jest.clearAllMocks();
    queue.add.mockResolvedValue({});
    pending.create.mockResolvedValue({});
    pending.delete.mockResolvedValue({});
    producer = new NotificationsProducer(
      queue as unknown as Queue,
      { pendingNotification: pending } as unknown as PrismaService,
    );
  });

  it('remove o autor da ação e duplicados', () => {
    producer.notify(
      NotificationType.TaskCommented,
      'eu',
      ['a', 'eu', 'a', 'b'],
      {},
    );
    expect(queue.add).toHaveBeenCalledWith(
      NotificationType.TaskCommented,
      expect.objectContaining({ actorId: 'eu', recipientIds: ['a', 'b'] }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('não enfileira quando não sobra destinatário', () => {
    producer.notify(NotificationType.TaskAssigned, 'eu', ['eu'], {});
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('falha no Redis não propaga e guarda a notificação no banco', async () => {
    queue.add.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(() =>
      producer.notify(NotificationType.MemberAdded, 'eu', ['a'], { x: 1 }),
    ).not.toThrow();
    await flush();
    await flush();
    const jobId = queue.add.mock.calls[0][2].jobId;
    expect(pending.create).toHaveBeenCalledWith({
      data: {
        id: jobId,
        type: NotificationType.MemberAdded,
        actorId: 'eu',
        recipientIds: ['a'],
        data: { x: 1 },
      },
    });
  });

  it('Redis que não responde também cai no banco', async () => {
    jest.useFakeTimers();
    try {
      queue.add.mockReturnValue(new Promise(() => undefined));
      producer.notify(NotificationType.MemberAdded, 'eu', ['a'], {});
      await jest.advanceTimersByTimeAsync(3000);
      expect(pending.create).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reenvia as guardadas com o mesmo jobId e para no primeiro erro', async () => {
    const row = (id: string) => ({
      id,
      type: NotificationType.TaskAssigned,
      actorId: null,
      recipientIds: ['a'],
      data: {},
      createdAt: new Date(),
    });
    pending.findMany.mockResolvedValue([row('p1'), row('p2'), row('p3')]);
    queue.add
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(producer.flushPending()).resolves.toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][2].jobId).toBe('p1');
    expect(pending.delete).toHaveBeenCalledTimes(1);
    expect(pending.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});

describe('NotificationsProcessor', () => {
  const prisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    notification: { createManyAndReturn: jest.fn() },
  };
  const realtime = { toUser: jest.fn() };
  const processor = new NotificationsProcessor(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeEmitter,
  );

  it('grava uma notificação por destinatário existente, com o autor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'eu', name: 'Eu' });
    prisma.user.findMany.mockResolvedValue([{ id: 'a' }]); // 'b' foi excluído
    prisma.notification.createManyAndReturn.mockResolvedValue([
      { id: 'n1', userId: 'a' },
    ]);

    const job = {
      data: {
        type: NotificationType.TaskAssigned,
        actorId: 'eu',
        recipientIds: ['a', 'b'],
        data: { taskId: 't1' },
      },
    } as unknown as Job<NotificationJob>;

    await expect(processor.process(job)).resolves.toBe(1);
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          userId: 'a',
          type: NotificationType.TaskAssigned,
          payload: { taskId: 't1', actor: { id: 'eu', name: 'Eu' } },
        },
      ],
    });
    expect(realtime.toUser).toHaveBeenCalledWith('a', 'notification.created', {
      notification: { id: 'n1', userId: 'a' },
    });
  });
});
