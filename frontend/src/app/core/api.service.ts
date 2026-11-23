import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import {
  AppNotification,
  Board,
  BoardColumn,
  BoardSummary,
  Comment,
  CursorPage,
  DashboardStats,
  Invitation,
  InvitationPreview,
  Member,
  MyDashboard,
  NotificationPage,
  Organization,
  OrganizationRole,
  Project,
  Task,
  TaskPriority,
  TokenPair,
  User,
} from './models';

const API = '/api/v1';

type Query = Record<string, string | number | boolean | undefined | null>;

function params(query: Query = {}) {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
}

export interface TaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  columnId?: string;
  assigneeIds?: string[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private get<T>(url: string, query?: Query) {
    return this.run(this.http.get<T>(API + url, { params: params(query) }));
  }
  private post<T>(url: string, body: unknown = {}) {
    return this.run(this.http.post<T>(API + url, body));
  }
  private patch<T>(url: string, body: unknown = {}) {
    return this.run(this.http.patch<T>(API + url, body));
  }
  private put<T>(url: string, body: unknown) {
    return this.run(this.http.put<T>(API + url, body));
  }
  private delete(url: string) {
    return this.run(this.http.delete<void>(API + url));
  }
  private run<T>(obs: Observable<T>) {
    return firstValueFrom(obs);
  }

  // Organizações
  organizations = () => this.get<Organization[]>('/organizations');
  organization = (id: string) => this.get<Organization>(`/organizations/${id}`);
  createOrganization = (name: string) =>
    this.post<Organization>('/organizations', { name });
  updateOrganization = (id: string, name: string) =>
    this.patch<Organization>(`/organizations/${id}`, { name });
  deleteOrganization = (id: string) => this.delete(`/organizations/${id}`);

  members = (orgId: string) =>
    this.get<Member[]>(`/organizations/${orgId}/members`);
  addMember = (orgId: string, email: string, role: OrganizationRole) =>
    this.post<Member>(`/organizations/${orgId}/members`, { email, role });
  updateMemberRole = (orgId: string, userId: string, role: OrganizationRole) =>
    this.patch<Member>(`/organizations/${orgId}/members/${userId}`, { role });
  removeMember = (orgId: string, userId: string) =>
    this.delete(`/organizations/${orgId}/members/${userId}`);

  // Projetos
  projects = (orgId: string, archived = false) =>
    this.get<Project[]>(`/organizations/${orgId}/projects`, { archived });
  project = (id: string) => this.get<Project>(`/projects/${id}`);
  createProject = (orgId: string, name: string, description?: string) =>
    this.post<Project>(`/organizations/${orgId}/projects`, {
      name,
      ...(description && { description }),
    });
  updateProject = (
    id: string,
    data: { name?: string; description?: string; archived?: boolean },
  ) => this.patch<Project>(`/projects/${id}`, data);
  deleteProject = (id: string) => this.delete(`/projects/${id}`);

  // Quadros e colunas
  boards = (projectId: string) =>
    this.get<BoardSummary[]>(`/projects/${projectId}/boards`);
  board = (id: string) => this.get<Board>(`/boards/${id}`);
  createBoard = (projectId: string, name: string) =>
    this.post<Board>(`/projects/${projectId}/boards`, { name });
  renameBoard = (id: string, name: string) =>
    this.patch<Board>(`/boards/${id}`, { name });
  deleteBoard = (id: string) => this.delete(`/boards/${id}`);

  createColumn = (boardId: string, name: string) =>
    this.post<BoardColumn>(`/boards/${boardId}/columns`, { name });
  renameColumn = (id: string, name: string) =>
    this.patch<BoardColumn>(`/columns/${id}`, { name });
  moveColumn = (id: string, afterColumnId: string | null) =>
    this.patch<BoardColumn>(`/columns/${id}/move`, { afterColumnId });
  deleteColumn = (id: string) => this.delete(`/columns/${id}`);

  // Tarefas
  tasks = (boardId: string) => this.get<Task[]>(`/boards/${boardId}/tasks`);
  task = (id: string) => this.get<Task>(`/tasks/${id}`);
  createTask = (boardId: string, data: TaskInput) =>
    this.post<Task>(`/boards/${boardId}/tasks`, data);
  updateTask = (id: string, data: TaskInput) =>
    this.patch<Task>(`/tasks/${id}`, data);
  moveTask = (id: string, columnId: string, afterTaskId: string | null) =>
    this.patch<Task>(`/tasks/${id}/move`, { columnId, afterTaskId });
  setAssignees = (id: string, userIds: string[]) =>
    this.put<Task>(`/tasks/${id}/assignees`, { userIds });
  deleteTask = (id: string) => this.delete(`/tasks/${id}`);

  // Comentários
  comments = (taskId: string, cursor?: string | null) =>
    this.get<CursorPage<Comment>>(`/tasks/${taskId}/comments`, {
      limit: 50,
      cursor,
    });
  createComment = (taskId: string, content: string) =>
    this.post<Comment>(`/tasks/${taskId}/comments`, { content });
  updateComment = (id: string, content: string) =>
    this.patch<Comment>(`/comments/${id}`, { content });
  deleteComment = (id: string) => this.delete(`/comments/${id}`);

  // Notificações
  notifications = (cursor?: string | null, unread?: boolean) =>
    this.get<NotificationPage>('/notifications', { limit: 20, cursor, unread });
  markNotificationRead = (id: string) =>
    this.patch<AppNotification>(`/notifications/${id}/read`);
  markAllNotificationsRead = () =>
    this.patch<{ updated: number }>('/notifications/read-all');
  deleteNotification = (id: string) => this.delete(`/notifications/${id}`);

  // Convites
  invitations = (orgId: string) =>
    this.get<Invitation[]>(`/organizations/${orgId}/invitations`);
  invite = (orgId: string, email: string, role: OrganizationRole) =>
    this.post<Invitation>(`/organizations/${orgId}/invitations`, {
      email,
      role,
    });
  revokeInvitation = (id: string) => this.delete(`/invitations/${id}`);
  invitationPreview = (token: string) =>
    this.get<InvitationPreview>(`/invitations/token/${token}`);
  acceptInvitation = (token: string) =>
    this.post<{ organizationId: string }>(`/invitations/token/${token}/accept`);

  // Conta
  updateProfile = (name: string) => this.patch<User>('/users/me', { name });
  uploadAvatar = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return this.put<User>('/users/me/avatar', form);
  };
  removeAvatar = () =>
    this.run(this.http.delete<User>(`${API}/users/me/avatar`));
  changePassword = (currentPassword: string, newPassword: string) =>
    this.patch<TokenPair>('/auth/password', { currentPassword, newPassword });
  forgotPassword = (email: string) =>
    this.post<void>('/auth/forgot-password', { email });
  resetPassword = (token: string, password: string) =>
    this.post<void>('/auth/reset-password', { token, password });

  // Dashboards
  myDashboard = () => this.get<MyDashboard>('/dashboard');
  organizationDashboard = (orgId: string) =>
    this.get<DashboardStats>(`/organizations/${orgId}/dashboard`);
  projectDashboard = (projectId: string) =>
    this.get<DashboardStats>(`/projects/${projectId}/dashboard`);
}
