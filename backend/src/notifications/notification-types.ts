export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationType {
  MemberAdded = 'MEMBER_ADDED',
  TaskAssigned = 'TASK_ASSIGNED',
  TaskCommented = 'TASK_COMMENTED',
}

export interface NotificationJob {
  type: NotificationType;
  actorId: string;
  recipientIds: string[];
  data: Record<string, unknown>;
}
