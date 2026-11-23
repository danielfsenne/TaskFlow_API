import { DatePipe } from '@angular/common';
import { FocusOnRenderDirective } from '../../shared/focus-on-render.directive';
import {
  Component,
  computed,
  effect,
  inject,
  Injector,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { Comment, TaskActivity, TaskPriority } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { AvatarComponent } from '../../shared/avatar.component';
import { PRIORITIES, PriorityLabelPipe } from '../../shared/labels';
import { LabelChipComponent } from '../../shared/label-chip.component';
import { RelativeTimePipe } from '../../shared/relative-time.pipe';
import { describeActivity } from './activity';
import { BoardStore } from './board.store';
import { LabelsDialogComponent } from './labels-dialog.component';

export interface TaskDialogData {
  taskId: string;
}

@Component({
  selector: 'app-task-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
    FocusOnRenderDirective,
    FormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    PriorityLabelPipe,
    AvatarComponent,
    RelativeTimePipe,
    LabelChipComponent,
  ],
  template: `
    @if (task(); as t) {
      <div class="flex max-h-[90vh] flex-col">
        <div class="flex items-start gap-2 px-6 pt-5">
          @if (editingTitle()) {
            <input
              class="flex-1 rounded-md border-0 p-1 text-xl font-semibold ring-1 ring-slate-400 focus:outline-none"
              [(ngModel)]="titleDraft"
              (keydown.enter)="saveTitle()"
              (keydown.escape)="editingTitle.set(false)"
              (blur)="saveTitle()"
              maxlength="200"
              aria-label="Título da tarefa"
              appFocusOnRender
            />
          } @else {
            <h2
              class="flex-1 break-words rounded-md p-1 text-xl font-semibold"
              [class.cursor-text]="!readOnly()"
              [class.hover:bg-slate-100]="!readOnly()"
              (click)="startTitle()"
            >
              {{ t.title }}
            </h2>
          }
          <button mat-icon-button mat-dialog-close aria-label="Fechar">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <p class="px-7 text-xs text-slate-500">
          em <strong>{{ columnName() }}</strong> · criada por
          {{ t.createdBy.name }} em {{ t.createdAt | date: 'short' }}
        </p>

        <mat-dialog-content class="!flex flex-col gap-5 !pt-4 md:!flex-row">
          <section class="min-w-0 flex-1">
            <h3 class="mb-1 text-sm font-semibold text-slate-700">Descrição</h3>
            @if (editingDescription()) {
              <textarea
                class="w-full rounded-md border-0 p-2 text-sm ring-1 ring-slate-400 focus:outline-none"
                rows="5"
                [(ngModel)]="descriptionDraft"
                maxlength="10000"
                aria-label="Descrição"
              ></textarea>
              <div class="mt-1 flex gap-1">
                <button
                  mat-flat-button
                  class="!h-8"
                  (click)="saveDescription()"
                >
                  Salvar
                </button>
                <button
                  mat-button
                  class="!h-8"
                  (click)="editingDescription.set(false)"
                >
                  Cancelar
                </button>
              </div>
            } @else {
              <div
                class="min-h-12 whitespace-pre-line rounded-md p-2 text-sm"
                [class.text-slate-400]="!t.description"
                [class.cursor-text]="!readOnly()"
                [class.hover:bg-slate-50]="!readOnly()"
                (click)="startDescription()"
              >
                {{
                  t.description ||
                    (readOnly()
                      ? 'Sem descrição.'
                      : 'Clique para adicionar uma descrição…')
                }}
              </div>
            }

            <div
              class="mb-3 mt-5 flex gap-4 border-b border-slate-200 text-sm"
              role="tablist"
            >
              <button
                role="tab"
                class="-mb-px border-b-2 pb-1.5"
                [class]="
                  tab() === 'comments'
                    ? 'border-ink font-semibold text-ink'
                    : 'border-transparent text-slate-500 hover:text-ink'
                "
                [attr.aria-selected]="tab() === 'comments'"
                (click)="tab.set('comments')"
              >
                Comentários ({{ t._count.comments }})
              </button>
              <button
                role="tab"
                class="-mb-px border-b-2 pb-1.5"
                [class]="
                  tab() === 'history'
                    ? 'border-ink font-semibold text-ink'
                    : 'border-transparent text-slate-500 hover:text-ink'
                "
                [attr.aria-selected]="tab() === 'history'"
                (click)="showHistory()"
                data-testid="history-tab"
              >
                Histórico
              </button>
            </div>
            @if (tab() === 'comments') {
              @if (!readOnly()) {
                <div class="mb-3 flex gap-2">
                  <textarea
                    class="flex-1 rounded-md border-0 p-2 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-slate-400"
                    rows="2"
                    placeholder="Escreva um comentário…"
                    [(ngModel)]="newComment"
                    (keydown.control.enter)="addComment()"
                    maxlength="5000"
                    aria-label="Novo comentário"
                  ></textarea>
                  <button
                    mat-flat-button
                    class="self-end"
                    (click)="addComment()"
                    [disabled]="!newComment.trim() || sending()"
                  >
                    Enviar
                  </button>
                </div>
              }
              <ul class="flex flex-col gap-3">
                @for (c of comments(); track c.id) {
                  <li class="flex gap-2" [attr.data-comment]="c.id">
                    <app-avatar
                      [name]="c.author.name"
                      [url]="c.author.avatarUrl"
                      [seed]="c.author.id"
                      [size]="28"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="text-xs text-slate-500">
                        <strong class="text-slate-700">{{
                          c.author.name
                        }}</strong>
                        · {{ c.createdAt | date: 'short' }}
                        @if (c.updatedAt !== c.createdAt) {
                          <span>(editado)</span>
                        }
                      </p>
                      @if (editingComment() === c.id) {
                        <textarea
                          class="mt-1 w-full rounded-md border-0 p-2 text-sm ring-1 ring-slate-400 focus:outline-none"
                          rows="2"
                          [(ngModel)]="commentDraft"
                          aria-label="Editar comentário"
                        ></textarea>
                        <div class="flex gap-1">
                          <button
                            mat-button
                            class="!h-7"
                            (click)="saveComment(c)"
                          >
                            Salvar
                          </button>
                          <button
                            mat-button
                            class="!h-7"
                            (click)="editingComment.set(null)"
                          >
                            Cancelar
                          </button>
                        </div>
                      } @else {
                        <p class="whitespace-pre-line break-words text-sm">
                          {{ c.content }}
                        </p>
                        @if (!readOnly()) {
                          <div class="flex gap-2 text-xs text-slate-500">
                            @if (c.authorId === store.me()) {
                              <button
                                class="hover:underline"
                                (click)="startEditComment(c)"
                              >
                                Editar
                              </button>
                            }
                            @if (
                              c.authorId === store.me() ||
                              store.canManageProject()
                            ) {
                              <button
                                class="hover:underline"
                                (click)="deleteComment(c)"
                              >
                                Excluir
                              </button>
                            }
                          </div>
                        }
                      }
                    </div>
                  </li>
                } @empty {
                  <li class="text-sm text-slate-400">
                    Nenhum comentário ainda.
                  </li>
                }
              </ul>
              @if (nextCursor()) {
                <button mat-button class="mt-2" (click)="loadMore()">
                  Carregar mais
                </button>
              }
            } @else {
              <ul class="flex flex-col gap-2.5" data-testid="history">
                @for (a of activity(); track a.id) {
                  <li
                    class="flex gap-2 text-[13px]"
                    [attr.data-activity]="a.type"
                  >
                    <app-avatar
                      [name]="a.actor.name"
                      [url]="a.actor.avatarUrl"
                      [seed]="a.actor.id"
                      [size]="22"
                    />
                    <p class="min-w-0 flex-1 leading-snug text-slate-600">
                      <strong class="font-medium text-ink">{{
                        a.actor.name
                      }}</strong>
                      {{ describeActivity(a) }}
                      <span class="block text-xs text-slate-400">{{
                        a.createdAt | relativeTime
                      }}</span>
                    </p>
                  </li>
                } @empty {
                  <li class="text-sm text-slate-400">
                    {{ loadingHistory() ? 'Carregando…' : 'Sem registros.' }}
                  </li>
                }
              </ul>
            }
          </section>

          <aside class="flex shrink-0 flex-col gap-3 pt-2 md:w-56">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Coluna</mat-label>
              <mat-select
                [value]="t.columnId"
                (selectionChange)="moveTo($event.value)"
                [disabled]="readOnly()"
              >
                @for (c of store.sortedColumns(); track c.id) {
                  <mat-option [value]="c.id">{{ c.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Prioridade</mat-label>
              <mat-select
                [value]="t.priority"
                (selectionChange)="setPriority($event.value)"
                [disabled]="readOnly()"
              >
                @for (p of priorities; track p) {
                  <mat-option [value]="p">{{ p | priorityLabel }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Responsáveis</mat-label>
              <mat-select
                multiple
                [value]="assigneeIds()"
                (selectionChange)="setAssignees($event.value)"
                [disabled]="readOnly()"
              >
                @for (m of store.members(); track m.id) {
                  <mat-option [value]="m.id">{{ m.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <div class="flex items-start gap-1">
              <mat-form-field
                appearance="outline"
                subscriptSizing="dynamic"
                class="flex-1"
              >
                <mat-label>Etiquetas</mat-label>
                <mat-select
                  multiple
                  [value]="labelIds()"
                  (selectionChange)="setLabels($event.value)"
                  [disabled]="readOnly() || !store.labels().length"
                  data-testid="task-labels"
                >
                  <mat-select-trigger>
                    <span class="flex flex-wrap gap-1">
                      @for (l of t.labels; track l.id) {
                        <app-label-chip [label]="l" />
                      }
                    </span>
                  </mat-select-trigger>
                  @for (l of store.labels(); track l.id) {
                    <mat-option [value]="l.id">
                      <app-label-chip [label]="l" />
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (!readOnly()) {
                <button
                  mat-icon-button
                  class="!mt-1"
                  (click)="openLabels()"
                  matTooltip="Gerenciar etiquetas"
                  aria-label="Gerenciar etiquetas"
                >
                  <mat-icon>sell</mat-icon>
                </button>
              }
            </div>

            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Prazo</mat-label>
              <input
                matInput
                [matDatepicker]="picker"
                [value]="t.dueDate ? dueDateValue() : null"
                (dateChange)="setDueDate($event.value)"
                [disabled]="readOnly()"
                readonly
              />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker />
            </mat-form-field>
            @if (t.dueDate && !readOnly()) {
              <button
                mat-button
                class="!justify-start"
                (click)="setDueDate(null)"
              >
                <mat-icon>event_busy</mat-icon>Remover prazo
              </button>
            }

            @if (canDelete()) {
              <button
                mat-button
                class="!mt-4 !justify-start !text-red-700"
                (click)="deleteTask()"
              >
                <mat-icon>delete</mat-icon>Excluir tarefa
              </button>
            }
          </aside>
        </mat-dialog-content>
      </div>
    }
  `,
})
export class TaskDialogComponent implements OnInit {
  readonly store = inject(BoardStore);
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly ref = inject(MatDialogRef<TaskDialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);
  readonly taskId = this.data.taskId;

  private readonly countedCreated = new Set<string>();
  private readonly countedDeleted = new Set<string>();

  readonly priorities = PRIORITIES;
  readonly describeActivity = describeActivity;
  readonly tab = signal<'comments' | 'history'>('comments');
  readonly activity = signal<TaskActivity[]>([]);
  readonly loadingHistory = signal(false);
  readonly task = computed(() =>
    this.store.tasks().find((t) => t.id === this.data.taskId),
  );
  readonly readOnly = this.store.readOnly;
  readonly columnName = computed(
    () =>
      this.store.columns().find((c) => c.id === this.task()?.columnId)?.name ??
      '',
  );
  readonly labelIds = computed(
    () => this.task()?.labels.map((l) => l.id) ?? [],
  );
  readonly assigneeIds = computed(
    () => this.task()?.assignees.map((a) => a.id) ?? [],
  );
  readonly dueDateValue = computed(() => {
    const due = this.task()?.dueDate;
    return due ? new Date(due) : null;
  });
  readonly canDelete = computed(
    () =>
      !this.readOnly() &&
      (this.task()?.createdById === this.store.me() ||
        this.store.canManageProject()),
  );

  readonly editingTitle = signal(false);
  readonly editingDescription = signal(false);
  readonly editingComment = signal<string | null>(null);
  readonly comments = signal<Comment[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly sending = signal(false);
  titleDraft = '';
  descriptionDraft = '';
  commentDraft = '';
  newComment = '';

  constructor() {
    effect(() => {
      if (!this.store.loading() && !this.task()) this.ref.close();
    });
    // a tarefa mudou (aqui ou por outra pessoa): atualiza o histórico aberto
    effect(() => {
      this.task()?.updatedAt;
      if (untracked(this.tab) === 'history') void this.loadHistory();
    });
  }

  async showHistory() {
    this.tab.set('history');
    await this.loadHistory();
  }

  private async loadHistory() {
    this.loadingHistory.set(true);
    try {
      this.activity.set(await this.api.taskActivity(this.data.taskId));
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  async ngOnInit() {
    try {
      const page = await this.api.comments(this.data.taskId);
      this.comments.set(page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      this.ui.error(e);
    }
  }

  receiveComment(comment: Comment): boolean {
    const isNew = !this.countedCreated.has(comment.id);
    this.countedCreated.add(comment.id);
    if (this.comments().some((c) => c.id === comment.id)) {
      this.comments.update((list) =>
        list.map((c) => (c.id === comment.id ? comment : c)),
      );
    } else if (!this.nextCursor()) {
      this.comments.update((list) => [...list, comment]);
    }
    return isNew;
  }

  forgetComment(commentId: string): boolean {
    const isNew = !this.countedDeleted.has(commentId);
    this.countedDeleted.add(commentId);
    this.comments.update((list) => list.filter((c) => c.id !== commentId));
    return isNew;
  }

  startTitle() {
    if (this.readOnly()) return;
    this.titleDraft = this.task()?.title ?? '';
    this.editingTitle.set(true);
  }

  async saveTitle() {
    if (!this.editingTitle()) return;
    this.editingTitle.set(false);
    const title = this.titleDraft.trim();
    if (title && title !== this.task()?.title) {
      await this.store.updateTask(this.data.taskId, { title });
    }
  }

  startDescription() {
    if (this.readOnly()) return;
    this.descriptionDraft = this.task()?.description ?? '';
    this.editingDescription.set(true);
  }

  async saveDescription() {
    this.editingDescription.set(false);
    const description = this.descriptionDraft.trim();
    await this.store.updateTask(this.data.taskId, {
      description: description || null,
    });
  }

  async setPriority(priority: TaskPriority) {
    await this.store.updateTask(this.data.taskId, { priority });
  }

  async setLabels(labelIds: string[]) {
    await this.store.setLabels(this.data.taskId, labelIds);
  }

  openLabels() {
    this.dialog.open(LabelsDialogComponent, {
      injector: this.injector,
      autoFocus: false,
      maxWidth: '96vw',
    });
  }

  async setAssignees(userIds: string[]) {
    await this.store.setAssignees(this.data.taskId, userIds);
  }

  // meio-dia local, para o fuso não mudar o dia
  async setDueDate(date: Date | null) {
    let dueDate: string | null = null;
    if (date) {
      const noon = new Date(date);
      noon.setHours(12, 0, 0, 0);
      dueDate = noon.toISOString();
    }
    await this.store.updateTask(this.data.taskId, { dueDate });
  }

  async moveTo(columnId: string) {
    const end = (this.store.tasksByColumn().get(columnId) ?? []).filter(
      (t) => t.id !== this.data.taskId,
    ).length;
    await this.store.moveTask(this.data.taskId, columnId, end);
  }

  async deleteTask() {
    const ok = await this.ui.confirm({
      title: 'Excluir tarefa?',
      message: 'A tarefa e os comentários dela serão apagados.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok && (await this.store.deleteTask(this.data.taskId))) this.ref.close();
  }

  async addComment() {
    const content = this.newComment.trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    try {
      const comment = await this.api.createComment(this.data.taskId, content);
      this.newComment = '';
      if (this.receiveComment(comment)) {
        this.store.bumpComments(this.data.taskId, 1);
      }
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.sending.set(false);
    }
  }

  async loadMore() {
    try {
      const page = await this.api.comments(this.data.taskId, this.nextCursor());
      this.comments.update((list) => [...list, ...page.items]);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      this.ui.error(e);
    }
  }

  startEditComment(c: Comment) {
    this.commentDraft = c.content;
    this.editingComment.set(c.id);
  }

  async saveComment(c: Comment) {
    const content = this.commentDraft.trim();
    if (!content) return;
    try {
      const updated = await this.api.updateComment(c.id, content);
      this.comments.update((list) =>
        list.map((x) => (x.id === c.id ? updated : x)),
      );
      this.editingComment.set(null);
    } catch (e) {
      this.ui.error(e);
    }
  }

  async deleteComment(c: Comment) {
    const ok = await this.ui.confirm({
      title: 'Excluir comentário?',
      message: 'O comentário será apagado.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteComment(c.id);
      if (this.forgetComment(c.id)) {
        this.store.bumpComments(this.data.taskId, -1);
      }
    } catch (e) {
      this.ui.error(e);
    }
  }
}
