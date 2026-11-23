import { Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';

describe('TaskActivityService.changes', () => {
  const service = new TaskActivityService(
    {} as PrismaService,
    {} as TaskAccessService,
  );
  const before = {
    title: 'Login',
    description: null,
    priority: 'MEDIUM',
    dueDate: new Date('2026-12-01T12:00:00.000Z'),
  } as Task;

  it('registra só o que mudou de fato', () => {
    expect(
      service.changes(before, {
        title: 'Login',
        priority: 'MEDIUM',
        dueDate: '2026-12-01T12:00:00.000Z',
        description: null,
      }),
    ).toEqual([]);
  });

  it('guarda antes e depois de título, prioridade e prazo', () => {
    expect(
      service.changes(before, {
        title: 'Login com Google',
        priority: 'URGENT',
        dueDate: null,
      }),
    ).toEqual([
      { type: 'TITLE', data: { from: 'Login', to: 'Login com Google' } },
      { type: 'PRIORITY', data: { from: 'MEDIUM', to: 'URGENT' } },
      {
        type: 'DUE_DATE',
        data: { from: '2026-12-01T12:00:00.000Z', to: null },
      },
    ]);
  });

  it('descrição alterada é registrada sem o texto', () => {
    expect(service.changes(before, { description: 'segredo' })).toEqual([
      { type: 'DESCRIPTION' },
    ]);
  });
});
