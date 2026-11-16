import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { ApiService, TaskInput } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  Board,
  BoardColumn,
  Member,
  Organization,
  Positioned,
  Project,
  Task,
  TaskPriority,
} from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { roleAtLeast } from '../../shared/labels';

export interface BoardFilters {
  search: string;
  assigneeId: string | null;
  priority: TaskPriority | null;
}

interface BoardState {
  board: Board | null;
  project: Project | null;
  organization: Organization | null;
  members: Member[];
  columns: BoardColumn[];
  tasks: Task[];
  loading: boolean;
  filters: BoardFilters;
}

const initialState: BoardState = {
  board: null,
  project: null,
  organization: null,
  members: [],
  columns: [],
  tasks: [],
  loading: true,
  filters: { search: '', assigneeId: null, priority: null },
};

const byPosition = (a: { position: number }, b: { position: number }) =>
  a.position - b.position;

/** Posição local provisória entre dois vizinhos (o servidor dá a definitiva). */
function localPosition(
  prev?: { position: number },
  next?: { position: number },
) {
  if (!prev && !next) return 1000;
  if (!prev) return next!.position / 2;
  if (!next) return prev.position + 1000;
  return (prev.position + next.position) / 2;
}

/** Só substitui se a versão recebida não for mais antiga que a local. */
function isNewer(incoming: Task, current: Task | undefined) {
  return !current || incoming.updatedAt >= current.updatedAt;
}

function applyPositions<T extends { id: string; position: number }>(
  items: T[],
  positions: Positioned[],
): T[] {
  const map = new Map(positions.map((p) => [p.id, p.position]));
  return items.map((i) =>
    map.has(i.id) ? { ...i, position: map.get(i.id)! } : i,
  );
}

export const BoardStore = signalStore(
  withState(initialState),

  withComputed((store, auth = inject(AuthService)) => {
    const sortedColumns = computed(() => [...store.columns()].sort(byPosition));

    const matches = computed(() => {
      const { search, assigneeId, priority } = store.filters();
      const term = search.trim().toLowerCase();
      return (t: Task) =>
        (!term || t.title.toLowerCase().includes(term)) &&
        (!priority || t.priority === priority) &&
        (!assigneeId || t.assignees.some((a) => a.id === assigneeId));
    });

    return {
      sortedColumns,
      /** Tarefas visíveis (após filtros) por coluna, já ordenadas. */
      tasksByColumn: computed(() => {
        const map = new Map<string, Task[]>();
        for (const c of store.columns()) map.set(c.id, []);
        const filter = matches();
        for (const t of store.tasks()) {
          if (filter(t)) map.get(t.columnId)?.push(t);
        }
        for (const list of map.values()) list.sort(byPosition);
        return map;
      }),
      hasFilters: computed(() => {
        const f = store.filters();
        return !!f.search.trim() || !!f.assigneeId || !!f.priority;
      }),
      readOnly: computed(() => store.project()?.archived ?? true),
      me: computed(() => auth.user()?.id ?? null),
      /** Criador do projeto ou ADMIN+ (pode excluir quadro e tarefas alheias). */
      canManageProject: computed(
        () =>
          roleAtLeast(store.organization()?.role, 'ADMIN') ||
          store.project()?.createdById === auth.user()?.id,
      ),
    };
  }),

  withMethods((store, api = inject(ApiService), ui = inject(UiService)) => {
    const upsertTask = (task: Task) => {
      const current = store.tasks().find((t) => t.id === task.id);
      if (!isNewer(task, current)) return;
      patchState(store, {
        tasks: current
          ? store.tasks().map((t) => (t.id === task.id ? task : t))
          : [...store.tasks(), task],
      });
    };

    const removeTask = (taskId: string) =>
      patchState(store, {
        tasks: store.tasks().filter((t) => t.id !== taskId),
      });

    const upsertColumn = (column: BoardColumn) => {
      const exists = store.columns().some((c) => c.id === column.id);
      patchState(store, {
        columns: exists
          ? store
              .columns()
              .map((c) => (c.id === column.id ? { ...c, ...column } : c))
          : [...store.columns(), column],
      });
    };

    const load = async (boardId: string) => {
      patchState(store, { ...initialState, filters: store.filters() });
      const [board, tasks] = await Promise.all([
        api.board(boardId),
        api.tasks(boardId),
      ]);
      const project = await api.project(board.projectId);
      const [organization, members] = await Promise.all([
        api.organization(project.organizationId),
        api.members(project.organizationId),
      ]);
      patchState(store, {
        board,
        columns: board.columns,
        tasks,
        project,
        organization,
        members,
        loading: false,
      });
    };

    /** Algo deu errado numa ação otimista: avisa e recarrega o estado real. */
    const recover = async (error: unknown) => {
      ui.error(error);
      const board = store.board();
      if (board) await load(board.id).catch(() => undefined);
    };

    return {
      load,
      upsertTask,
      removeTask,
      upsertColumn,

      setFilters(filters: Partial<BoardFilters>) {
        patchState(store, { filters: { ...store.filters(), ...filters } });
      },
      clearFilters() {
        patchState(store, { filters: initialState.filters });
      },

      async createTask(columnId: string, title: string) {
        const board = store.board();
        if (!board) return;
        try {
          upsertTask(await api.createTask(board.id, { title, columnId }));
        } catch (e) {
          ui.error(e);
        }
      },

      async updateTask(taskId: string, data: TaskInput) {
        try {
          const task = await api.updateTask(taskId, data);
          upsertTask(task);
          return task;
        } catch (e) {
          ui.error(e);
          return null;
        }
      },

      async setAssignees(taskId: string, userIds: string[]) {
        try {
          const task = await api.setAssignees(taskId, userIds);
          upsertTask(task);
          return task;
        } catch (e) {
          ui.error(e);
          return null;
        }
      },

      async deleteTask(taskId: string) {
        try {
          await api.deleteTask(taskId);
          removeTask(taskId);
          return true;
        } catch (e) {
          ui.error(e);
          return false;
        }
      },

      /**
       * Move a tarefa para `toColumnId`, na posição `toIndex` da lista visível.
       * Atualiza a tela na hora e confirma com o servidor.
       */
      async moveTask(taskId: string, toColumnId: string, toIndex: number) {
        const task = store.tasks().find((t) => t.id === taskId);
        if (!task) return;
        const target = (store.tasksByColumn().get(toColumnId) ?? []).filter(
          (t) => t.id !== taskId,
        );
        const prev = target[toIndex - 1];
        const next = target[toIndex];
        if (
          task.columnId === toColumnId &&
          prev?.id ===
            targetPrevId(store.tasksByColumn().get(toColumnId) ?? [], taskId)
        ) {
          return; // Soltou no mesmo lugar.
        }

        patchState(store, {
          tasks: store
            .tasks()
            .map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    columnId: toColumnId,
                    position: localPosition(prev, next),
                  }
                : t,
            ),
        });

        try {
          const moved = await api.moveTask(
            taskId,
            toColumnId,
            prev?.id ?? null,
          );
          upsertTask(moved);
        } catch (e) {
          await recover(e);
        }
      },

      /** Aplica um movimento vindo do servidor (tempo real). */
      applyTaskMove(task: Task, positions: Positioned[]) {
        const current = store.tasks().find((t) => t.id === task.id);
        if (!isNewer(task, current)) return;
        const others = positions.filter((p) => p.id !== task.id);
        patchState(store, {
          tasks: applyPositions(store.tasks(), others).map((t) =>
            t.id === task.id ? task : t,
          ),
        });
        if (!current) upsertTask(task);
      },

      async moveColumn(columnId: string, toIndex: number) {
        const others = store.sortedColumns().filter((c) => c.id !== columnId);
        const prev = others[toIndex - 1];
        const next = others[toIndex];
        patchState(store, {
          columns: store
            .columns()
            .map((c) =>
              c.id === columnId
                ? { ...c, position: localPosition(prev, next) }
                : c,
            ),
        });
        try {
          await api.moveColumn(columnId, prev?.id ?? null);
        } catch (e) {
          await recover(e);
        }
      },

      applyColumnPositions(positions: Positioned[]) {
        patchState(store, {
          columns: applyPositions(store.columns(), positions),
        });
      },

      async createColumn(name: string) {
        const board = store.board();
        if (!board) return;
        try {
          upsertColumn(await api.createColumn(board.id, name));
        } catch (e) {
          ui.error(e);
        }
      },

      async renameColumn(columnId: string, name: string) {
        try {
          upsertColumn(await api.renameColumn(columnId, name));
        } catch (e) {
          ui.error(e);
        }
      },

      async deleteColumn(columnId: string) {
        try {
          await api.deleteColumn(columnId);
          patchState(store, {
            columns: store.columns().filter((c) => c.id !== columnId),
          });
        } catch (e) {
          ui.error(e);
        }
      },

      removeColumn(columnId: string) {
        patchState(store, {
          columns: store.columns().filter((c) => c.id !== columnId),
        });
      },

      async renameBoard(name: string) {
        const board = store.board();
        if (!board) return;
        try {
          const updated = await api.renameBoard(board.id, name);
          patchState(store, { board: { ...board, name: updated.name } });
        } catch (e) {
          ui.error(e);
        }
      },

      async deleteBoard() {
        const board = store.board();
        if (!board) return false;
        try {
          await api.deleteBoard(board.id);
          return true;
        } catch (e) {
          ui.error(e);
          return false;
        }
      },

      setBoardName(name: string) {
        const board = store.board();
        if (board) patchState(store, { board: { ...board, name } });
      },

      /** Contador de comentários no card, sem recarregar a tarefa. */
      bumpComments(taskId: string, delta: number) {
        patchState(store, {
          tasks: store
            .tasks()
            .map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    _count: {
                      comments: Math.max(0, t._count.comments + delta),
                    },
                  }
                : t,
            ),
        });
      },
    };
  }),
);

/** ID da tarefa que hoje está imediatamente acima de `taskId` na lista. */
function targetPrevId(list: Task[], taskId: string): string | undefined {
  const i = list.findIndex((t) => t.id === taskId);
  return i > 0 ? list[i - 1].id : undefined;
}
