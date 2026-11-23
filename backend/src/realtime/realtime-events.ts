export const RealtimeEvent = {
  BoardUpdated: 'board.updated', // { board }
  BoardDeleted: 'board.deleted', // { boardId }

  ColumnCreated: 'column.created', // { column }
  ColumnUpdated: 'column.updated', // { column }
  ColumnMoved: 'column.moved', // { columnId, positions: [{ id, position }] }
  ColumnDeleted: 'column.deleted', // { columnId }

  TaskCreated: 'task.created', // { task }
  TaskUpdated: 'task.updated', // { task }  (inclui troca de responsáveis)
  TaskMoved: 'task.moved', // { task, fromColumnId, positions }
  TaskDeleted: 'task.deleted', // { taskId, columnId }

  LabelCreated: 'label.created', // { label }
  LabelUpdated: 'label.updated', // { label }
  LabelDeleted: 'label.deleted', // { labelId }

  AttachmentCreated: 'attachment.created', // { taskId, attachment }
  AttachmentDeleted: 'attachment.deleted', // { taskId, attachmentId }

  CommentCreated: 'comment.created', // { taskId, comment }
  CommentUpdated: 'comment.updated', // { taskId, comment }
  CommentDeleted: 'comment.deleted', // { taskId, commentId }

  NotificationCreated: 'notification.created', // { notification }
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const boardRoom = (boardId: string) => `board:${boardId}`;
export const userRoom = (userId: string) => `user:${userId}`;
