/**
 * Contrato do tempo real (namespace Socket.IO `/realtime`).
 *
 * Conexão: `io(URL + '/realtime', { auth: { token: accessToken } })`.
 * Token inválido ou ausente → `connect_error`. Quando o token expira o
 * servidor desconecta; o cliente renova o token e reconecta.
 *
 * Cliente → servidor (com ack `{ ok: true } | { ok: false, error }`):
 *   - `board:join`  { boardId }  passa a receber os eventos do quadro
 *   - `board:leave` { boardId }
 *
 * Servidor → cliente: todo evento de quadro traz `actorId` (quem fez a
 * alteração), para o cliente ignorar o eco das próprias ações.
 */
export const RealtimeEvent = {
  BoardUpdated: 'board.updated', // { board }
  BoardDeleted: 'board.deleted', // { boardId }

  ColumnCreated: 'column.created', // { column }
  ColumnUpdated: 'column.updated', // { column }
  ColumnMoved: 'column.moved', // { columnId, positions: [{ id, position }] }
  ColumnDeleted: 'column.deleted', // { columnId }

  TaskCreated: 'task.created', // { task }
  TaskUpdated: 'task.updated', // { task }  (inclui troca de responsáveis)
  /** `positions` traz todas as tarefas cuja posição mudou (várias se a coluna foi renumerada). */
  TaskMoved: 'task.moved', // { task, fromColumnId, positions }
  TaskDeleted: 'task.deleted', // { taskId, columnId }

  CommentCreated: 'comment.created', // { taskId, comment }
  CommentUpdated: 'comment.updated', // { taskId, comment }
  CommentDeleted: 'comment.deleted', // { taskId, commentId }

  /** Enviado só ao destinatário (sala do usuário), em qualquer tela. */
  NotificationCreated: 'notification.created', // { notification }
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const boardRoom = (boardId: string) => `board:${boardId}`;
export const userRoom = (userId: string) => `user:${userId}`;
