import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { BoardAccessService } from '../boards/board-access.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { NotificationType } from '../notifications/notification-types';
import { NotificationsProducer } from '../notifications/notifications.producer';
import { TaskAccessService } from './task-access.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const tx = { task: { findMany: jest.fn(), update: jest.fn() } };
  const prisma = {
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]),
    ),
    task: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    boardColumn: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn(), count: jest.fn() },
    taskAssignee: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const boardAccess = {
    getWritableBoard: jest.fn(),
    getBoardAccess: jest.fn(),
  };
  const notifications = { notify: jest.fn() };
  let service: TasksService;

  const project = {
    id: 'p1',
    organizationId: 'o1',
    createdById: 'dono',
    archived: false,
  };
  const storedTask = (over: object = {}) => ({
    id: 't1',
    boardId: 'b1',
    columnId: 'c1',
    createdById: 'autor',
    board: { project },
    ...over,
  });
  const asMember = (role: OrganizationRole = OrganizationRole.MEMBER) =>
    prisma.organizationMember.findUnique.mockResolvedValue({ role });
  const fullTask = { id: 't1', assignees: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    const p = prisma as unknown as PrismaService;
    service = new TasksService(
      p,
      boardAccess as unknown as BoardAccessService,
      new TaskAccessService(
        p,
        new ProjectAccessService(p, new OrganizationAccessService(p)),
      ),
      notifications as unknown as NotificationsProducer,
    );
    prisma.task.findUniqueOrThrow.mockResolvedValue(fullTask);
  });

  describe('notificações de atribuição', () => {
    it('ao criar, notifica os responsáveis informados', async () => {
      boardAccess.getWritableBoard.mockResolvedValue({ project });
      prisma.boardColumn.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.organizationMember.count.mockResolvedValue(2);
      prisma.task.create.mockResolvedValue({
        id: 't9',
        title: 'Nova',
        boardId: 'b1',
        assignees: [],
      });
      await service.create('b1', 'u', {
        title: 'Nova',
        assigneeIds: ['a', 'b'],
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        NotificationType.TaskAssigned,
        'u',
        ['a', 'b'],
        expect.objectContaining({ taskId: 't9', taskTitle: 'Nova' }),
      );
    });

    it('ao redefinir, notifica só quem foi adicionado', async () => {
      prisma.task.findUnique.mockResolvedValue(storedTask());
      asMember();
      prisma.organizationMember.count.mockResolvedValue(2);
      prisma.taskAssignee.findMany.mockResolvedValue([{ userId: 'a' }]);
      await service.setAssignees('t1', 'u', ['a', 'b']);
      expect(notifications.notify).toHaveBeenCalledWith(
        NotificationType.TaskAssigned,
        'u',
        ['b'],
        expect.objectContaining({ taskId: 't1' }),
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      boardAccess.getWritableBoard.mockResolvedValue({ project });
      prisma.task.create.mockResolvedValue(fullTask);
    });

    it('sem coluna informada, usa a primeira e coloca no fim', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.task.findFirst.mockResolvedValue({ position: 3000 });
      await service.create('b1', 'u', { title: 'X' });
      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ columnId: 'c1', position: 4000 }),
        }),
      );
    });

    it('rejeita coluna de outro quadro', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.create('b1', 'u', { title: 'X', columnId: 'outra' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita responsável que não é da organização', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue({ id: 'c1' });
      prisma.organizationMember.count.mockResolvedValue(1);
      await expect(
        service.create('b1', 'u', { title: 'X', assigneeIds: ['a', 'b'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    beforeEach(() => {
      prisma.task.findUnique.mockResolvedValue(storedTask());
      asMember();
    });

    it('troca de coluna entre duas tarefas', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue({ id: 'c2' });
      tx.task.findMany.mockResolvedValue([
        { id: 'x', position: 1000 },
        { id: 'y', position: 2000 },
      ]);
      await service.move('t1', 'u', { columnId: 'c2', afterTaskId: 'x' });
      expect(tx.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { columnId: 'c2', position: 1500 },
      });
    });

    it('renumera só a posição das outras tarefas', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue({ id: 'c2' });
      tx.task.findMany.mockResolvedValue([
        { id: 'x', position: 1 },
        { id: 'y', position: 1 + 1e-7 },
      ]);
      await service.move('t1', 'u', { columnId: 'c2', afterTaskId: 'x' });
      expect(tx.task.update.mock.calls.map(([a]) => a)).toEqual([
        { where: { id: 'x' }, data: { position: 1000 } },
        { where: { id: 't1' }, data: { columnId: 'c2', position: 2000 } },
        { where: { id: 'y' }, data: { position: 3000 } },
      ]);
    });

    it('rejeita coluna de destino de outro quadro', async () => {
      prisma.boardColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.move('t1', 'u', { columnId: 'c9', afterTaskId: null }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('bloqueia projeto arquivado', async () => {
      prisma.task.findUnique.mockResolvedValue(
        storedTask({ board: { project: { ...project, archived: true } } }),
      );
      await expect(
        service.move('t1', 'u', { columnId: 'c1', afterTaskId: null }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    beforeEach(() => prisma.task.findUnique.mockResolvedValue(storedTask()));

    it('o autor pode excluir', async () => {
      asMember();
      await service.remove('t1', 'autor');
      expect(prisma.task.delete).toHaveBeenCalled();
    });

    it('outro MEMBER não pode excluir', async () => {
      asMember();
      await expect(service.remove('t1', 'outro')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });

    it('ADMIN pode excluir tarefa de outro', async () => {
      asMember(OrganizationRole.ADMIN);
      await service.remove('t1', 'admin');
      expect(prisma.task.delete).toHaveBeenCalled();
    });

    it('quem não é da organização recebe 404', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      await expect(service.remove('t1', 'estranho')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
