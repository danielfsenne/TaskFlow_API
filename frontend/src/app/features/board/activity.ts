import { TaskActivity, TaskPriority } from '../../core/models';
import { PRIORITY_LABELS } from '../../shared/labels';

const names = (items: TaskActivity['data']['added']) =>
  (items ?? []).map((i) => (typeof i === 'string' ? i : i.name));

// "Ana, Beto e Caio"
export function joinNames(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

const priority = (p: string | null | undefined) =>
  p ? PRIORITY_LABELS[p as TaskPriority].toLowerCase() : '';

// frase depois do nome de quem fez: "Ana moveu de A fazer para Em andamento"
export function describeActivity(a: TaskActivity): string {
  const d = a.data;
  switch (a.type) {
    case 'CREATED':
      return `criou a tarefa em ${d.column}`;
    case 'MOVED':
      return `moveu de ${d.from ?? 'outra coluna'} para ${d.to}`;
    case 'TITLE':
      return `renomeou para "${d.to}"`;
    case 'DESCRIPTION':
      return 'alterou a descrição';
    case 'PRIORITY':
      return `mudou a prioridade de ${priority(d.from)} para ${priority(d.to)}`;
    case 'DUE_DATE':
      if (!d.to) return 'removeu o prazo';
      if (!d.from) return `definiu o prazo para ${day(d.to)}`;
      return `mudou o prazo de ${day(d.from)} para ${day(d.to)}`;
    case 'ASSIGNEES':
    case 'LABELS': {
      const what = a.type === 'LABELS' ? 'a etiqueta' : '';
      const added = names(d.added);
      const removed = names(d.removed);
      const parts: string[] = [];
      if (added.length) {
        parts.push(
          a.type === 'LABELS'
            ? `adicionou ${added.length > 1 ? 'as etiquetas' : what} ${joinNames(added)}`
            : `atribuiu a ${joinNames(added)}`,
        );
      }
      if (removed.length) {
        parts.push(
          a.type === 'LABELS'
            ? `tirou ${removed.length > 1 ? 'as etiquetas' : what} ${joinNames(removed)}`
            : `tirou ${joinNames(removed)} dos responsáveis`,
        );
      }
      return parts.join(' e ');
    }
    default:
      return 'alterou a tarefa';
  }
}
