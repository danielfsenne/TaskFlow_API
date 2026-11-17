import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BoardColumn,
  Comment,
  Positioned,
  Task,
  TaskPriority,
} from '../../core/models';
import { BoardEvent, RealtimeService } from '../../core/realtime.service';
import { WorkspaceService } from '../../core/workspace.service';
import { UiService } from '../../shared/dialogs';
import { PRIORITIES, PriorityLabelPipe } from '../../shared/labels';
import { BoardStore } from './board.store';
import { TaskCardComponent } from './task-card.component';
import { TaskDialogComponent } from './task-dialog.component';

@Component({
  selector: 'app-board',
  providers: [BoardStore],
  imports: [
    FormsModule,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    PriorityLabelPipe,
    TaskCardComponent,
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .cdk-drag-preview {
      box-shadow: 0 8px 24px rgb(15 23 42 / 0.2);
      border-radius: 0.5rem;
    }
    .cdk-drag-animating,
    .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
  `,
  template: `
    @if (store.board(); as board) {
      <header
        class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-3"
      >
        <div class="min-w-0">
          <nav class="text-xs text-slate-500">
            <a
              [routerLink]="['/orgs', store.project()?.organizationId]"
              class="hover:underline"
              >{{ store.organization()?.name }}</a
            >
            /
            <a
              [routerLink]="['/projects', board.projectId]"
              class="hover:underline"
              >{{ store.project()?.name }}</a
            >
          </nav>
          <div class="flex items-center gap-1">
            <h1 class="truncate text-lg font-semibold">{{ board.name }}</h1>
            @if (!store.readOnly()) {
              <button
                mat-icon-button
                [matMenuTriggerFor]="boardMenu"
                aria-label="Opções do quadro"
                class="!-my-2"
              >
                <mat-icon>more_horiz</mat-icon>
              </button>
              <mat-menu #boardMenu="matMenu">
                <button mat-menu-item (click)="renameBoard()">
                  <mat-icon>edit</mat-icon>Renomear quadro
                </button>
                @if (store.canManageProject()) {
                  <button
                    mat-menu-item
                    (click)="deleteBoard()"
                    class="!text-red-700"
                  >
                    <mat-icon class="!text-red-700">delete</mat-icon>Excluir
                    quadro
                  </button>
                }
              </mat-menu>
            }
          </div>
        </div>

        <span class="flex-1"></span>

        <div class="flex flex-wrap items-center gap-2">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            class="compact w-44"
          >
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              placeholder="Buscar"
              [ngModel]="store.filters().search"
              (ngModelChange)="store.setFilters({ search: $event })"
            />
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            class="compact w-40"
          >
            <mat-select
              placeholder="Responsável"
              [ngModel]="store.filters().assigneeId"
              (ngModelChange)="store.setFilters({ assigneeId: $event })"
            >
              <mat-option [value]="null">Todos</mat-option>
              @for (m of store.members(); track m.id) {
                <mat-option [value]="m.id">{{ m.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            class="compact w-36"
          >
            <mat-select
              placeholder="Prioridade"
              [ngModel]="store.filters().priority"
              (ngModelChange)="store.setFilters({ priority: $event })"
            >
              <mat-option [value]="null">Todas</mat-option>
              @for (p of priorities; track p) {
                <mat-option [value]="p">{{ p | priorityLabel }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (store.hasFilters()) {
            <button mat-button (click)="store.clearFilters()">Limpar</button>
          }
        </div>
      </header>

      @if (store.readOnly()) {
        <p class="shrink-0 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Projeto arquivado: o quadro está somente leitura.
        </p>
      }

      <div class="min-h-0 flex-1 overflow-x-auto">
        <div
          class="flex h-full items-start gap-3 p-4"
          cdkDropList
          id="columns"
          cdkDropListOrientation="horizontal"
          [cdkDropListData]="store.sortedColumns()"
          [cdkDropListDisabled]="store.readOnly()"
          (cdkDropListDropped)="dropColumn($event)"
        >
          @for (column of store.sortedColumns(); track column.id) {
            @let tasks = store.tasksByColumn().get(column.id) ?? [];
            <section
              cdkDrag
              [cdkDragData]="column"
              class="flex max-h-full w-72 shrink-0 flex-col rounded-md bg-[#eceef1]"
              [attr.data-column]="column.name"
            >
              <div
                class="flex items-center gap-1 px-3 pb-1 pt-2"
                cdkDragHandle
                [class.cursor-grab]="!store.readOnly()"
              >
                <h2
                  class="flex-1 truncate text-sm font-semibold text-slate-700"
                >
                  {{ column.name }}
                </h2>
                <span
                  class="rounded-full bg-slate-200 px-2 text-xs text-slate-600"
                  >{{ tasks.length }}</span
                >
                @if (!store.readOnly()) {
                  <button
                    mat-icon-button
                    [matMenuTriggerFor]="colMenu"
                    class="!h-8 !w-8 !p-1"
                    [attr.aria-label]="'Opções da coluna ' + column.name"
                  >
                    <mat-icon class="!text-lg">more_vert</mat-icon>
                  </button>
                  <mat-menu #colMenu="matMenu">
                    <button mat-menu-item (click)="renameColumn(column)">
                      <mat-icon>edit</mat-icon>Renomear
                    </button>
                    <button mat-menu-item (click)="deleteColumn(column)">
                      <mat-icon>delete</mat-icon>Excluir
                    </button>
                  </mat-menu>
                }
              </div>

              <div
                cdkDropList
                [id]="column.id"
                [cdkDropListData]="column.id"
                [cdkDropListConnectedTo]="taskListIds()"
                [cdkDropListDisabled]="store.readOnly()"
                (cdkDropListDropped)="dropTask($event)"
                class="flex min-h-12 flex-col gap-2 overflow-y-auto px-2 pb-2"
              >
                @for (task of tasks; track task.id) {
                  <app-task-card
                    cdkDrag
                    [cdkDragData]="task"
                    [task]="task"
                    [done]="column.id === doneColumnId()"
                    (click)="openTask(task)"
                    class="block cursor-pointer"
                    [attr.data-task]="task.title"
                  >
                    <div
                      *cdkDragPlaceholder
                      class="h-14 rounded border border-dashed border-slate-400 bg-slate-200/60"
                    ></div>
                  </app-task-card>
                }
              </div>

              @if (!store.readOnly()) {
                @if (addingTo() === column.id) {
                  <form class="px-2 pb-2" (ngSubmit)="addTask(column.id)">
                    <textarea
                      class="w-full resize-none rounded border-0 p-2 text-sm ring-1 ring-slate-400 focus:outline-none"
                      rows="2"
                      placeholder="Título da tarefa"
                      name="title"
                      [(ngModel)]="newTitle"
                      (keydown.enter)="
                        $event.preventDefault(); addTask(column.id)
                      "
                      (keydown.escape)="addingTo.set(null)"
                      autofocus
                    ></textarea>
                    <div class="mt-1 flex gap-1">
                      <button mat-flat-button type="submit" class="!h-8">
                        Adicionar
                      </button>
                      <button
                        mat-button
                        type="button"
                        class="!h-8"
                        (click)="addingTo.set(null)"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                } @else {
                  <button
                    class="m-2 mt-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-200"
                    (click)="startAdding(column.id)"
                  >
                    <mat-icon class="!text-lg">add</mat-icon> Adicionar tarefa
                  </button>
                }
              }
            </section>
          }

          @if (!store.readOnly()) {
            <button
              class="flex w-72 shrink-0 items-center gap-1 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
              (click)="addColumn()"
            >
              <mat-icon class="!text-lg">add</mat-icon> Nova coluna
            </button>
          }
        </div>
      </div>
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
})
export class BoardComponent {
  readonly store = inject(BoardStore);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly boardId = input.required<string>();
  readonly taskParam = input<string | undefined>(undefined, { alias: 'task' });

  private readonly dialog = inject(MatDialog);
  private readonly realtime = inject(RealtimeService);
  private readonly injector = inject(Injector);
  private taskDialog: MatDialogRef<TaskDialogComponent> | null = null;

  readonly priorities: TaskPriority[] = PRIORITIES;
  readonly addingTo = signal<string | null>(null);
  newTitle = '';

  readonly taskListIds = computed(() =>
    this.store.sortedColumns().map((c) => c.id),
  );
  readonly doneColumnId = computed(() => {
    const cols = this.store.sortedColumns();
    return cols.length >= 2 ? cols[cols.length - 1].id : null;
  });

  constructor() {
    const workspace = inject(WorkspaceService);
    effect(() => {
      const orgId = this.store.project()?.organizationId;
      if (orgId) untracked(() => workspace.activeOrgId.set(orgId));
    });
    effect(() => {
      const id = this.boardId();
      this.store.load(id).catch(async (e) => {
        this.ui.error(e);
        await this.router.navigate(['/']);
      });
    });

    effect((onCleanup) => {
      const id = this.boardId();
      void this.realtime.joinBoard(id);
      onCleanup(() => this.realtime.leaveBoard(id));
    });
    this.listenRealtime();

    effect(() => {
      const taskId = this.taskParam();
      const loaded = !this.store.loading();
      if (taskId && loaded && this.store.tasks().some((t) => t.id === taskId)) {
        untracked(() => this.openTask({ id: taskId }));
      }
    });
  }

  private listenRealtime() {
    const rt = this.realtime;
    const forThisBoard = <T extends BoardEvent>(event: string) =>
      rt.on<T>(event).pipe(takeUntilDestroyed());
    const s = this.store;

    forThisBoard<BoardEvent & { task: Task }>('task.created').subscribe((e) =>
      s.upsertTask(e.task),
    );
    forThisBoard<BoardEvent & { task: Task }>('task.updated').subscribe((e) =>
      s.upsertTask(e.task),
    );
    forThisBoard<BoardEvent & { task: Task; positions: Positioned[] }>(
      'task.moved',
    ).subscribe((e) => s.applyTaskMove(e.task, e.positions));
    forThisBoard<BoardEvent & { taskId: string }>('task.deleted').subscribe(
      (e) => s.removeTask(e.taskId),
    );

    forThisBoard<BoardEvent & { column: BoardColumn }>(
      'column.created',
    ).subscribe((e) => s.upsertColumn(e.column));
    forThisBoard<BoardEvent & { column: BoardColumn }>(
      'column.updated',
    ).subscribe((e) => s.upsertColumn(e.column));
    forThisBoard<BoardEvent & { positions: Positioned[] }>(
      'column.moved',
    ).subscribe((e) => s.applyColumnPositions(e.positions));
    forThisBoard<BoardEvent & { columnId: string }>('column.deleted').subscribe(
      (e) => s.removeColumn(e.columnId),
    );

    forThisBoard<BoardEvent & { board: { id: string; name: string } }>(
      'board.updated',
    ).subscribe((e) => {
      if (e.board.id === s.board()?.id) s.setBoardName(e.board.name);
    });
    forThisBoard<BoardEvent & { boardId: string }>('board.deleted').subscribe(
      (e) => {
        const board = s.board();
        if (!board || e.boardId !== board.id) return;
        if (e.actorId !== s.me())
          this.ui.toast('Este quadro foi excluído por outra pessoa.');
        this.dialog.closeAll();
        void this.router.navigate(['/projects', board.projectId]);
      },
    );

    const openPanel = (taskId: string) => {
      const panel = this.taskDialog?.componentInstance;
      return panel && panel.taskId === taskId ? panel : null;
    };
    forThisBoard<BoardEvent & { taskId: string; comment: Comment }>(
      'comment.created',
    ).subscribe((e) => {
      const panel = openPanel(e.taskId);
      const isNew = panel ? panel.receiveComment(e.comment) : true;
      if (isNew) s.bumpComments(e.taskId, 1);
    });
    forThisBoard<BoardEvent & { taskId: string; comment: Comment }>(
      'comment.updated',
    ).subscribe((e) => openPanel(e.taskId)?.receiveComment(e.comment));
    forThisBoard<BoardEvent & { taskId: string; commentId: string }>(
      'comment.deleted',
    ).subscribe((e) => {
      const panel = openPanel(e.taskId);
      const isNew = panel ? panel.forgetComment(e.commentId) : true;
      if (isNew) s.bumpComments(e.taskId, -1);
    });

    rt.reconnected$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void s.refresh());
  }

  dropColumn(event: CdkDragDrop<BoardColumn[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const column = event.item.data as BoardColumn;
    void this.store.moveColumn(column.id, event.currentIndex);
  }

  dropTask(event: CdkDragDrop<string>) {
    const task = event.item.data as Task;
    void this.store.moveTask(task.id, event.container.data, event.currentIndex);
  }

  startAdding(columnId: string) {
    this.newTitle = '';
    this.addingTo.set(columnId);
  }

  async addTask(columnId: string) {
    const title = this.newTitle.trim();
    if (!title) return;
    this.newTitle = '';
    await this.store.createTask(columnId, title.slice(0, 200));
  }

  openTask(task: Pick<Task, 'id'>) {
    if (this.taskDialog) return;
    this.taskDialog = this.dialog.open(TaskDialogComponent, {
      data: { taskId: task.id },
      // mesma BoardStore do quadro
      injector: this.injector,
      width: '900px',
      maxWidth: '96vw',
      autoFocus: false,
    });
    void this.router.navigate([], {
      queryParams: { task: task.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.taskDialog.afterClosed().subscribe(() => {
      this.taskDialog = null;
      void this.router.navigate([], {
        queryParams: { task: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  async addColumn() {
    const result = await this.ui.form({
      title: 'Nova coluna',
      submitLabel: 'Criar',
      minLength: 1,
      maxLength: 50,
    });
    if (result) await this.store.createColumn(result.name);
  }

  async renameColumn(column: BoardColumn) {
    const result = await this.ui.form({
      title: 'Renomear coluna',
      name: column.name,
      minLength: 1,
      maxLength: 50,
    });
    if (result) await this.store.renameColumn(column.id, result.name);
  }

  async deleteColumn(column: BoardColumn) {
    const count = this.store
      .tasks()
      .filter((t) => t.columnId === column.id).length;
    if (count > 0) {
      this.ui.toast(
        `Mova as ${count} tarefas de "${column.name}" antes de excluir a coluna.`,
      );
      return;
    }
    const ok = await this.ui.confirm({
      title: 'Excluir coluna?',
      message: `A coluna "${column.name}" será removida do quadro.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) await this.store.deleteColumn(column.id);
  }

  async renameBoard() {
    const board = this.store.board();
    if (!board) return;
    const result = await this.ui.form({
      title: 'Renomear quadro',
      name: board.name,
      minLength: 1,
      maxLength: 80,
    });
    if (result) await this.store.renameBoard(result.name);
  }

  async deleteBoard() {
    const board = this.store.board();
    if (!board) return;
    const ok = await this.ui.confirm({
      title: 'Excluir quadro?',
      message: `"${board.name}" e todas as tarefas dele serão apagados. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    if (await this.store.deleteBoard()) {
      this.ui.toast('Quadro excluído');
      await this.router.navigate(['/projects', board.projectId]);
    }
  }
}
