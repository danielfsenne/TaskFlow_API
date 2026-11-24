import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Board, Label, Project, Task } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { BoardStore } from './board.store';

const label = (id: string, name = id): Label => ({ id, name, color: 'blue' });

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    boardId: 'b1',
    columnId: 'todo',
    title: id,
    description: null,
    priority: 'MEDIUM',
    position: 1000,
    dueDate: null,
    completedAt: null,
    createdById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: { id: 'u1', name: 'Ana', avatarUrl: null },
    assignees: [],
    labels: [],
    _count: { comments: 0, attachments: 0 },
    ...over,
  };
}

const column = (id: string, position: number) => ({
  id,
  boardId: 'b1',
  name: id,
  position,
  createdAt: '',
  updatedAt: '',
});

const board: Board = {
  id: 'b1',
  projectId: 'p1',
  name: 'Quadro',
  createdAt: '',
  updatedAt: '',
  columns: [column('doing', 2000), column('todo', 1000)],
  labels: [label('bug')],
};

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  organizationId: 'o1',
  name: 'Projeto',
  description: null,
  archived: false,
  createdById: 'u1',
  createdAt: '',
  updatedAt: '',
  createdBy: { id: 'u1', name: 'Ana', avatarUrl: null },
  _count: { boards: 1 },
  ...over,
});

describe('BoardStore', () => {
  let store: InstanceType<typeof BoardStore>;
  let api: jasmine.SpyObj<ApiService>;
  let ui: jasmine.SpyObj<UiService>;

  async function loadWith(tasks: Task[]) {
    api.board.and.resolveTo(board);
    api.tasks.and.resolveTo(tasks);
    await store.load('b1');
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'board',
      'tasks',
      'project',
      'organization',
      'members',
      'moveTask',
    ]);
    api.project.and.resolveTo(project());
    api.organization.and.resolveTo({
      id: 'o1',
      name: 'Org',
      slug: 'org',
      role: 'MEMBER',
      createdAt: '',
      updatedAt: '',
    });
    api.members.and.resolveTo([]);
    ui = jasmine.createSpyObj<UiService>('UiService', ['error']);

    TestBed.configureTestingModule({
      providers: [
        BoardStore,
        { provide: ApiService, useValue: api },
        { provide: UiService, useValue: ui },
        {
          provide: AuthService,
          useValue: { user: signal({ id: 'u2', name: 'Beto' }) },
        },
      ],
    });
    store = TestBed.inject(BoardStore);
  });

  it('carrega o quadro com colunas em ordem e tarefas por coluna', async () => {
    await loadWith([
      task('b', { position: 2000 }),
      task('a', { position: 1000 }),
      task('c', { columnId: 'doing' }),
    ]);
    expect(store.loading()).toBeFalse();
    expect(store.sortedColumns().map((c) => c.id)).toEqual(['todo', 'doing']);
    expect(
      store
        .tasksByColumn()
        .get('todo')!
        .map((t) => t.id),
    ).toEqual(['a', 'b']);
    expect(store.readOnly()).toBeFalse();
    // MEMBER que não criou o projeto
    expect(store.canManageProject()).toBeFalse();
  });

  it('filtra por texto, prioridade, responsável e etiqueta', async () => {
    await loadWith([
      task('Corrigir login', {
        priority: 'HIGH',
        labels: [label('bug')],
        assignees: [
          { id: 'u2', name: 'Beto', avatarUrl: null, assignedAt: '' },
        ],
      }),
      task('Escrever docs'),
    ]);
    const visible = () =>
      [...store.tasksByColumn().values()].flat().map((t) => t.id);

    store.setFilters({ search: '  LOGIN ' });
    expect(visible()).toEqual(['Corrigir login']);
    expect(store.hasFilters()).toBeTrue();

    store.setFilters({ search: '', priority: 'LOW' });
    expect(visible()).toEqual([]);

    store.setFilters({ priority: null, assigneeId: 'u2', labelId: 'bug' });
    expect(visible()).toEqual(['Corrigir login']);

    store.clearFilters();
    expect(visible().length).toBe(2);
    expect(store.hasFilters()).toBeFalse();
  });

  it('ignora versão mais antiga de uma tarefa (eco atrasado do tempo real)', async () => {
    await loadWith([task('t1', { updatedAt: '2026-01-02T00:00:00.000Z' })]);
    store.upsertTask(
      task('t1', { title: 'velho', updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(store.tasks()[0].title).toBe('t1');
    store.upsertTask(
      task('t1', { title: 'novo', updatedAt: '2026-01-03T00:00:00.000Z' }),
    );
    expect(store.tasks()[0].title).toBe('novo');
  });

  it('etiqueta excluída sai dos cards e do filtro ativo', async () => {
    await loadWith([task('t1', { labels: [label('bug')] })]);
    store.setFilters({ labelId: 'bug' });
    store.removeLabel('bug');
    expect(store.labels()).toEqual([]);
    expect(store.tasks()[0].labels).toEqual([]);
    expect(store.filters().labelId).toBeNull();
  });

  it('etiqueta renomeada atualiza os cards e mantém ordem alfabética', async () => {
    await loadWith([task('t1', { labels: [label('bug')] })]);
    store.upsertLabel(label('ux', 'acessibilidade'));
    store.upsertLabel(label('bug', 'zebra'));
    expect(store.labels().map((l) => l.name)).toEqual([
      'acessibilidade',
      'zebra',
    ]);
    expect(store.tasks()[0].labels[0].name).toBe('zebra');
  });

  it('contagem de anexos é idempotente e não apaga a de comentários', async () => {
    await loadWith([task('t1', { _count: { comments: 2, attachments: 0 } })]);
    store.attachmentAdded('t1', 'a1');
    store.attachmentAdded('t1', 'a1');
    expect(store.tasks()[0]._count).toEqual({ comments: 2, attachments: 1 });
    store.bumpComments('t1', 1);
    store.attachmentRemoved('t1', 'a1');
    store.attachmentRemoved('t1', 'a1');
    expect(store.tasks()[0]._count).toEqual({ comments: 3, attachments: 0 });
  });

  it('mover tarefa atualiza na hora e envia a vizinha anterior', async () => {
    await loadWith([
      task('a', { position: 1000 }),
      task('b', { columnId: 'doing', position: 1000 }),
      task('c', { columnId: 'doing', position: 2000 }),
    ]);
    let resolve!: (t: Task) => void;
    api.moveTask.and.returnValue(new Promise((r) => (resolve = r)));

    const done = store.moveTask('a', 'doing', 1);
    const doing = () =>
      store
        .tasksByColumn()
        .get('doing')!
        .map((t) => t.id);
    expect(doing()).toEqual(['b', 'a', 'c']);
    expect(api.moveTask).toHaveBeenCalledWith('a', 'doing', 'b');

    resolve(
      task('a', {
        columnId: 'doing',
        position: 1500,
        updatedAt: '2026-01-05T00:00:00.000Z',
      }),
    );
    await done;
    expect(doing()).toEqual(['b', 'a', 'c']);
  });

  it('falha ao mover mostra o erro e recarrega o quadro', async () => {
    await loadWith([task('a')]);
    api.moveTask.and.rejectWith(new Error('offline'));
    await store.moveTask('a', 'doing', 0);
    expect(ui.error).toHaveBeenCalled();
    expect(store.tasks()[0].columnId).toBe('todo');
  });

  it('projeto arquivado por outra pessoa deixa o quadro somente leitura', async () => {
    await loadWith([]);
    store.setProject(project({ id: 'outro', archived: true }));
    expect(store.readOnly()).toBeFalse();
    store.setProject(project({ archived: true }));
    expect(store.readOnly()).toBeTrue();
  });
});
