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

export type LabelColor =
  | 'gray'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink';

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumn[];
  labels: Label[];
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
  completedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary;
  assignees: Assignee[];
  labels: Label[];
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
  | 'TASK_COMMENTED'
  | 'TASK_DUE_SOON';

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
    dueDate?: string;
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

export interface StatTotals {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
}

export interface DashboardStats {
  totals: StatTotals;
  byPriority: { priority: TaskPriority; open: number }[];
  byMember: {
    user: UserSummary;
    open: number;
    completed: number;
    overdue: number;
  }[];
  weekly: { weekStart: string; created: number; completed: number }[];
  breakdown: {
    id: string;
    name: string;
    total: number;
    open: number;
    completed: number;
    overdue: number;
  }[];
}

export interface MyTask {
  id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
  boardId: string;
  boardName: string;
  columnName: string;
  commentCount: number;
  project: { id: string; name: string };
  organization: { id: string; name: string };
}

export interface MyDashboard {
  totals: {
    open: number;
    overdue: number;
    dueSoon: number;
    completedThisWeek: number;
  };
  tasks: MyTask[];
  organizations: {
    id: string;
    name: string;
    members: number;
    projects: number;
    openTasks: number;
  }[];
}

export interface Invitation {
  id: string;
  email: string;
  role: OrganizationRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
}

export interface InvitationPreview {
  email: string;
  role: OrganizationRole;
  organization: { id: string; name: string };
  invitedBy: { id: string; name: string };
  expired: boolean;
}
