/** Tipos das respostas da API (espelham o backend). */

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserSummary = Pick<User, 'id' | 'name' | 'avatarUrl'>;

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number; projects: number };
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary;
  _count: { boards: number };
}

export interface BoardSummary {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { columns: number; tasks: number };
}

export interface BoardColumn {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumn[];
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Assignee extends UserSummary {
  assignedAt: string;
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  position: number;
  dueDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary;
  assignees: Assignee[];
  _count: { comments: number };
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type NotificationType =
  | 'MEMBER_ADDED'
  | 'TASK_ASSIGNED'
  | 'TASK_COMMENTED';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: {
    actor: UserSummary | null;
    organizationId?: string;
    organizationName?: string;
    role?: OrganizationRole;
    taskId?: string;
    taskTitle?: string;
    boardId?: string;
    projectId?: string;
    projectName?: string;
    commentId?: string;
    excerpt?: string;
  };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends CursorPage<AppNotification> {
  unreadCount: number;
}

export interface Positioned {
  id: string;
  position: number;
}
