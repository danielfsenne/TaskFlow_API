import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
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
import { Comment, TaskPriority } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import {
  InitialsPipe,
  PRIORITIES,
  PriorityLabelPipe,
} from '../../shared/labels';
import { BoardStore } from './board.store';

export interface TaskDialogData {
  taskId: string;
}

@Component({
  selector: 'app-task-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    DatePipe,
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
    InitialsPipe,
  ],
  template: `
    @if (task(); as t) {
      <div class="flex max-h-[90vh] flex-col">
        <div class="flex items-start gap-2 px-6 pt-5">
          @if (editingTitle()) {
            <input
              class="flex-1 rounded-md border-0 p-1 text-xl font-semibold ring-1 ring-blue-400 focus:outline-none"
              [(ngModel)]="titleDraft"
              (keydown.enter)="saveTitle()"
              (keydown.escape)="editingTitle.set(false)"
              (blur)="saveTitle()"
              maxlength="200"
              aria-label="Título da tarefa"
              autofocus
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
          <!-- Coluna principal: descrição e comentários -->
          <section class="min-w-0 flex-1">
            <h3 class="mb-1 text-sm font-semibold text-slate-700">Descrição</h3>
            @if (editingDescription()) {
              <textarea
                class="w-full rounded-md border-0 p-2 text-sm ring-1 ring-blue-400 focus:outline-none"
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

            <h3 class="mb-2 mt-5 text-sm font-semibold text-slate-700">
              Comentários ({{ t._count.comments }})
            </h3>
            @if (!readOnly()) {
              <div class="mb-3 flex gap-2">
                <textarea
                  class="flex-1 rounded-md border-0 p-2 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-blue-400"
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
                  <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-medium text-blue-800"
                  >
                    {{ c.author.name | initials }}
                  </span>
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
                        class="mt-1 w-full rounded-md border-0 p-2 text-sm ring-1 ring-blue-400 focus:outline-none"
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
                <li class="text-sm text-slate-400">Nenhum comentário ainda.</li>
              }
            </ul>
            @if (nextCursor()) {
              <button mat-button class="mt-2" (click)="loadMore()">
                Carregar mais
              </button>
            }
          </section>

          <!-- Lateral: propriedades -->
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
  private readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);
  readonly taskId = this.data.taskId;

  /**
   * Comentários já contados no card (criados ou removidos). O eco do tempo
   * real chega junto com a resposta HTTP; isso evita contar duas vezes.
   */
  private readonly countedCreated = new Set<string>();
  private readonly countedDeleted = new Set<string>();

  readonly priorities = PRIORITIES;
  readonly task = computed(() =>
    this.store.tasks().find((t) => t.id === this.data.taskId),
  );
  readonly readOnly = this.store.readOnly;
  readonly columnName = computed(
    () =>
      this.store.columns().find((c) => c.id === this.task()?.columnId)?.name ??
      '',
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
    // A tarefa sumiu (excluída aqui ou por outra pessoa): fecha o painel.
    effect(() => {
      if (!this.store.loading() && !this.task()) this.ref.close();
    });
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

  // Comentários vindos do tempo real (chamados pelo quadro).
  /** Retorna true se o comentário ainda não tinha sido contado. */
  receiveComment(comment: Comment): boolean {
    const isNew = !this.countedCreated.has(comment.id);
    this.countedCreated.add(comment.id);
    if (this.comments().some((c) => c.id === comment.id)) {
      this.comments.update((list) =>
        list.map((c) => (c.id === comment.id ? comment : c)),
      );
    } else if (!this.nextCursor()) {
      // Só acrescenta no fim se a lista já está toda carregada.
      this.comments.update((list) => [...list, comment]);
    }
    return isNew;
  }

  /** Retorna true se a remoção ainda não tinha sido contada. */
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

  async setAssignees(userIds: string[]) {
    await this.store.setAssignees(this.data.taskId, userIds);
  }

  /** Guarda o prazo ao meio-dia local, para não mudar de dia com o fuso. */
  async setDueDate(date: Date | null) {
    let dueDate: string | null = null;
    if (date) {
      const noon = new Date(date);
      noon.setHours(12, 0, 0, 0);
      dueDate = noon.toISOString();
    }
    await this.store.updateTask(this.data.taskId, { dueDate });
  }

  /** Trocar de coluna pelo painel coloca a tarefa no fim da coluna de destino. */
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
