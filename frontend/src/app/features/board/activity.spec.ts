import { TaskActivity } from '../../core/models';
import { describeActivity, joinNames } from './activity';

const activity = (
  type: TaskActivity['type'],
  data: TaskActivity['data'],
): TaskActivity => ({ type, data }) as TaskActivity;

describe('histórico da tarefa', () => {
  it('junta nomes como em português', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Beto', 'Caio'])).toBe('Ana, Beto e Caio');
  });

  it('descreve movimentos, título e prioridade', () => {
    expect(
      describeActivity(activity('MOVED', { from: 'A fazer', to: 'Feito' })),
    ).toBe('moveu de A fazer para Feito');
    expect(describeActivity(activity('MOVED', { to: 'Feito' }))).toBe(
      'moveu de outra coluna para Feito',
    );
    expect(describeActivity(activity('TITLE', { to: 'Novo' }))).toBe(
      'renomeou para "Novo"',
    );
    expect(
      describeActivity(activity('PRIORITY', { from: 'LOW', to: 'URGENT' })),
    ).toBe('mudou a prioridade de baixa para urgente');
  });

  it('descreve prazo definido, alterado e removido', () => {
    const iso = '2026-03-10T12:00:00.000Z';
    expect(describeActivity(activity('DUE_DATE', { to: iso }))).toBe(
      'definiu o prazo para 10/03',
    );
    expect(
      describeActivity(
        activity('DUE_DATE', { from: iso, to: '2026-04-02T12:00:00.000Z' }),
      ),
    ).toBe('mudou o prazo de 10/03 para 02/04');
    expect(
      describeActivity(activity('DUE_DATE', { from: iso, to: null })),
    ).toBe('removeu o prazo');
  });

  it('descreve responsáveis e etiquetas adicionados e retirados', () => {
    expect(
      describeActivity(
        activity('ASSIGNEES', {
          added: ['Ana'],
          removed: [{ name: 'Beto', color: 'gray' }],
        }),
      ),
    ).toBe('atribuiu a Ana e tirou Beto dos responsáveis');
    expect(describeActivity(activity('LABELS', { added: ['bug'] }))).toBe(
      'adicionou a etiqueta bug',
    );
    expect(
      describeActivity(activity('LABELS', { removed: ['bug', 'ux'] })),
    ).toBe('tirou as etiquetas bug e ux');
  });
});
