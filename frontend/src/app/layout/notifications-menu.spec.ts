import { AppNotification } from '../core/models';
import {
  describe as describeNotification,
  dueLabel,
} from './notifications-menu.component';

describe('textos das notificações', () => {
  const now = new Date(2026, 10, 25, 12, 0);
  const at = (day: number, hour: number) =>
    new Date(2026, 10, day, hour, 0).toISOString();

  it('descreve o prazo em relação a hoje', () => {
    expect(dueLabel(at(25, 18), now)).toBe('hoje às 18:00');
    expect(dueLabel(at(26, 9), now)).toBe('amanhã às 09:00');
    expect(dueLabel(at(24, 10), now)).toBe('ontem às 10:00');
    expect(dueLabel(at(20, 14), now)).toBe('em 20/11 às 14:00');
    expect(dueLabel(undefined, now)).toBe('em breve');
  });

  it('avisa tarefa atrasada com o projeto no detalhe', () => {
    const n = {
      type: 'TASK_OVERDUE',
      payload: {
        taskTitle: 'Deploy',
        projectName: 'Site',
        dueDate: new Date(Date.now() - 86_400_000).toISOString(),
        actor: null,
      },
    } as unknown as AppNotification;
    const { text, detail } = describeNotification(n);
    expect(text).toMatch(
      /^"Deploy" está atrasada \(venceu ontem às \d\d:\d\d\)$/,
    );
    expect(detail).toBe('Site');
  });
});
