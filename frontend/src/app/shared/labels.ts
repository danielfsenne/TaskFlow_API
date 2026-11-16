import { Pipe, PipeTransform } from '@angular/core';
import { OrganizationRole, TaskPriority } from '../core/models';

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Admin',
  MEMBER: 'Membro',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Classes Tailwind do selo de prioridade. */
export const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-50 text-blue-700',
  HIGH: 'bg-amber-50 text-amber-800',
  URGENT: 'bg-red-50 text-red-700',
};

export const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const RANK: Record<OrganizationRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};
export const roleAtLeast = (
  role: OrganizationRole | undefined,
  min: OrganizationRole,
) => !!role && RANK[role] >= RANK[min];
export const outranks = (a: OrganizationRole, b: OrganizationRole) =>
  RANK[a] > RANK[b];

@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(role: OrganizationRole | undefined) {
    return role ? ROLE_LABELS[role] : '';
  }
}

@Pipe({ name: 'priorityLabel' })
export class PriorityLabelPipe implements PipeTransform {
  transform(priority: TaskPriority) {
    return PRIORITY_LABELS[priority];
  }
}

/** Iniciais para o avatar: "Maria Souza" → "MS". */
@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | undefined | null) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (
      (parts[0]?.[0] ?? '') +
      (parts.length > 1 ? parts[parts.length - 1][0] : '')
    ).toUpperCase();
  }
}
