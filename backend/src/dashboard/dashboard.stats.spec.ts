import { computeStats, StatTask, weekStart } from './dashboard.stats';

describe('dashboard stats', () => {
  // Quarta-feira, 18/11/2026, 12:00 UTC
  const now = new Date('2026-11-18T12:00:00Z');
  const task = (over: Partial<StatTask> = {}): StatTask => ({
    priority: 'MEDIUM',
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-11-16T10:00:00Z'),
    groupId: 'g1',
    assigneeIds: [],
    ...over,
  });
  const members = [
    { id: 'ana', name: 'Ana', avatarUrl: null },
    { id: 'beto', name: 'Beto', avatarUrl: null },
  ];

  it('semana começa na segunda-feira', () => {
    expect(weekStart(now).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(weekStart(new Date('2026-11-22T23:00:00Z')).toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('totais distinguem abertas, concluídas, atrasadas e a vencer', () => {
    const { totals } = computeStats(
      [
        task({ dueDate: new Date('2026-11-10T00:00:00Z') }), // atrasada
        task({
          dueDate: new Date('2026-11-20T00:00:00Z'),
          assigneeIds: ['ana'],
        }), // a vencer
        task({ dueDate: new Date('2026-12-30T00:00:00Z') }), // longe
        // concluída com prazo vencido não conta como atrasada
        task({
          dueDate: new Date('2026-11-01T00:00:00Z'),
          completedAt: new Date('2026-11-17T00:00:00Z'),
        }),
      ],
      [],
      members,
      now,
    );
    expect(totals).toEqual({
      total: 4,
      open: 3,
      completed: 1,
      overdue: 1,
      dueSoon: 1,
      unassigned: 2,
    });
  });

  it('carga por membro inclui quem não tem tarefa, mais carregado primeiro', () => {
    const { byMember } = computeStats(
      [
        task({ assigneeIds: ['beto'] }),
        task({ assigneeIds: ['beto', 'ana'], completedAt: now }),
      ],
      [],
      members,
      now,
    );
    expect(byMember.map((m) => [m.user.id, m.open, m.completed])).toEqual([
      ['beto', 1, 1],
      ['ana', 0, 1],
    ]);
  });

  it('série semanal tem 8 semanas e ignora o que é mais antigo', () => {
    const { weekly } = computeStats(
      [
        task({ createdAt: new Date('2026-11-16T10:00:00Z'), completedAt: now }),
        task({ createdAt: new Date('2026-11-09T10:00:00Z') }),
        task({ createdAt: new Date('2025-01-01T00:00:00Z') }),
      ],
      [],
      [],
      now,
    );
    expect(weekly).toHaveLength(8);
    expect(weekly[7]).toEqual({
      weekStart: '2026-11-16T00:00:00.000Z',
      created: 1,
      completed: 1,
    });
    expect(weekly[6].created).toBe(1);
    expect(weekly.reduce((s, w) => s + w.created, 0)).toBe(2);
  });

  it('detalha por grupo e por prioridade (só abertas)', () => {
    const stats = computeStats(
      [
        task({ groupId: 'g1', priority: 'URGENT' }),
        task({ groupId: 'g2', priority: 'URGENT', completedAt: now }),
      ],
      [
        { id: 'g1', name: 'Site' },
        { id: 'g2', name: 'App' },
      ],
      [],
      now,
    );
    expect(stats.breakdown.map((b) => [b.name, b.open, b.completed])).toEqual([
      ['Site', 1, 0],
      ['App', 0, 1],
    ]);
    expect(stats.byPriority[0]).toEqual({ priority: 'URGENT', open: 1 });
  });
});
