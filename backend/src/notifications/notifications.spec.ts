import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationJob, NotificationType } from './notification-types';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsProducer } from './notifications.producer';

describe('NotificationsProducer', () => {
  const queue = { add: jest.fn() };
  let producer: NotificationsProducer;

  beforeEach(() => {
    jest.clearAllMocks();
    queue.add.mockResolvedValue({});
    producer = new NotificationsProducer(queue as unknown as Queue);
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

  it('falha no Redis não propaga para quem chamou', async () => {
    queue.add.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(() =>
      producer.notify(NotificationType.MemberAdded, 'eu', ['a'], {}),
    ).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});

describe('NotificationsProcessor', () => {
  const prisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const processor = new NotificationsProcessor(
    prisma as unknown as PrismaService,
  );

  it('grava uma notificação por destinatário existente, com o autor', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'eu', name: 'Eu' });
    prisma.user.findMany.mockResolvedValue([{ id: 'a' }]); // 'b' foi excluído
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const job = {
      data: {
        type: NotificationType.TaskAssigned,
        actorId: 'eu',
        recipientIds: ['a', 'b'],
        data: { taskId: 't1' },
      },
    } as unknown as Job<NotificationJob>;

    await expect(processor.process(job)).resolves.toBe(1);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'a',
          type: NotificationType.TaskAssigned,
          payload: { taskId: 't1', actor: { id: 'eu', name: 'Eu' } },
        },
      ],
    });
  });
});
