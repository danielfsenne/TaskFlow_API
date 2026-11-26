export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationType {
  MemberAdded = 'MEMBER_ADDED',
  TaskAssigned = 'TASK_ASSIGNED',
  TaskCommented = 'TASK_COMMENTED',
  TaskDueSoon = 'TASK_DUE_SOON',
  TaskOverdue = 'TASK_OVERDUE',
}

export interface NotificationJob {
  type: NotificationType;
  // null quando quem avisa é o sistema (ex.: lembrete de prazo)
  actorId: string | null;
  recipientIds: string[];
  data: Record<string, unknown>;
}
