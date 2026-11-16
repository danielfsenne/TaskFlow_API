export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationType {
  /** Você foi adicionado a uma organização. */
  MemberAdded = 'MEMBER_ADDED',
  /** Você virou responsável por uma tarefa. */
  TaskAssigned = 'TASK_ASSIGNED',
  /** Comentaram numa tarefa que você criou ou da qual é responsável. */
  TaskCommented = 'TASK_COMMENTED',
}

export interface NotificationJob {
  type: NotificationType;
  /** Quem causou o evento; nunca é notificado da própria ação. */
  actorId: string;
  recipientIds: string[];
  /** Dados do evento (IDs e títulos), gravados no payload junto com o autor. */
  data: Record<string, unknown>;
}
