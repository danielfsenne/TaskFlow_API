import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AppNotification, MyDashboard, MyTask } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { WorkspaceService } from '../../core/workspace.service';
import { StatTileComponent } from '../../shared/charts';
import { UiService } from '../../shared/dialogs';
import { PRIORITY_CLASSES, PriorityLabelPipe } from '../../shared/labels';

const DAY = 24 * 60 * 60 * 1000;

interface Bucket {
  key: string;
  title: string;
  tone: string;
  tasks: MyTask[];
}

export function bucketize(tasks: MyTask[], now = new Date()): Bucket[] {
  const soon = now.getTime() + 7 * DAY;
  const bucket = (key: string, title: string, tone: string): Bucket => ({
    key,
    title,
    tone,
    tasks: [],
  });
  const buckets = [
    bucket('overdue', 'Atrasadas', 'text-critical'),
    bucket('soon', 'Próximos 7 dias', 'text-amber-700'),
    bucket('later', 'Depois', 'text-slate-600'),
    bucket('none', 'Sem prazo', 'text-slate-500'),
  ];
  for (const t of tasks) {
    const due = t.dueDate ? new Date(t.dueDate).getTime() : null;
    const i = due === null ? 3 : due < now.getTime() ? 0 : due <= soon ? 1 : 2;
    buckets[i].tasks.push(t);
  }
  return buckets.filter((b) => b.tasks.length > 0);
}

@Component({
  selector: 'app-home',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatProgressBarModule,
    PriorityLabelPipe,
    StatTileComponent,
  ],
  template: `
    <div class="page">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-ink">Início</h1>
          <p class="text-[13px] text-slate-500 first-letter:uppercase">
            {{ today | date: "EEEE, d 'de' MMMM" }}
          </p>
        </div>
        <button mat-stroked-button (click)="createOrganization()">
          Nova organização
        </button>
      </header>

      @if (!data()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (data()!.organizations.length === 0) {
        <div class="card max-w-xl px-5 py-6">
          <p class="font-medium text-ink">
            Você ainda não participa de nenhuma organização.
          </p>
          <p class="mt-1 text-[13px] text-slate-500">
            Crie uma ou peça para alguém te adicionar pelo e-mail
            <span class="text-slate-700">{{ auth.user()?.email }}</span
            >.
          </p>
          <button mat-flat-button class="!mt-4" (click)="createOrganization()">
            Criar organização
          </button>
        </div>
      } @else {
        @let d = data()!;
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <app-stat-tile label="Atribuídas a mim" [value]="d.totals.open" />
          <app-stat-tile
            label="Atrasadas"
            [value]="d.totals.overdue"
            icon="error_outline"
            [tone]="d.totals.overdue ? 'critical' : 'neutral'"
          />
          <app-stat-tile
            label="Vencem em 7 dias"
            [value]="d.totals.dueSoon"
            icon="schedule"
            [tone]="d.totals.dueSoon ? 'warning' : 'neutral'"
          />
          <app-stat-tile
            label="Concluídas na semana"
            [value]="d.totals.completedThisWeek"
          />
        </div>

        <div class="mt-5 grid gap-5 lg:grid-cols-3">
          <section class="lg:col-span-2" data-testid="my-tasks">
            <h2 class="mb-2 text-sm font-semibold text-ink">Minhas tarefas</h2>
            <div class="card overflow-hidden">
              @if (buckets().length === 0) {
                <p class="px-4 py-8 text-center text-[13px] text-slate-500">
                  Nenhuma tarefa aberta atribuída a você.
                </p>
              } @else {
                @for (b of buckets(); track b.key) {
                  <div
                    class="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-xs font-medium"
                    [class]="b.tone"
                  >
                    {{ b.title }}
                    <span class="font-normal text-slate-400">{{
                      b.tasks.length
                    }}</span>
                  </div>
                  <ul>
                    @for (t of b.tasks; track t.id) {
                      <li class="border-b border-slate-100 last:border-b-0">
                        <a
                          [routerLink]="['/boards', t.boardId]"
                          [queryParams]="{ task: t.id }"
                          class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50"
                          [attr.data-my-task]="t.title"
                        >
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-[13px] text-ink">
                              {{ t.title }}
                            </p>
                            <p class="truncate text-xs text-slate-400">
                              {{ t.project.name }} / {{ t.boardName }} ·
                              {{ t.columnName }}
                            </p>
                          </div>
                          <span
                            class="chip hidden sm:inline-flex"
                            [class]="priorityClass(t)"
                            >{{ t.priority | priorityLabel }}</span
                          >
                          <span
                            class="w-12 shrink-0 text-right text-xs tabular-nums"
                            [class]="
                              b.key === 'overdue'
                                ? 'text-critical'
                                : 'text-slate-500'
                            "
                            >{{
                              t.dueDate ? (t.dueDate | date: 'dd/MM') : ''
                            }}</span
                          >
                        </a>
                      </li>
                    }
                  </ul>
                }
              }
            </div>
          </section>

          <section>
            <h2 class="mb-2 text-sm font-semibold text-ink">Organizações</h2>
            <ul class="card divide-y divide-slate-100">
              @for (o of d.organizations; track o.id) {
                <li>
                  <a
                    [routerLink]="['/orgs', o.id]"
                    class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                    [attr.data-org]="o.name"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[13px] font-medium text-ink">
                        {{ o.name }}
                      </p>
                      <p class="text-xs text-slate-400">
                        {{ o.projects }}
                        {{ o.projects === 1 ? 'projeto' : 'projetos' }} ·
                        {{ o.members }}
                        {{ o.members === 1 ? 'membro' : 'membros' }}
                      </p>
                    </div>
                    <span class="text-xs tabular-nums text-slate-500"
                      >{{ o.openTasks }} abertas</span
                    >
                  </a>
                </li>
              }
            </ul>
          </section>
        </div>
      }
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);
  readonly auth = inject(AuthService);

  readonly data = signal<MyDashboard | null>(null);
  readonly today = new Date();
  readonly buckets = computed(() => bucketize(this.data()?.tasks ?? []));

  constructor() {
    this.workspace.activeOrgId.set(null);
    inject(RealtimeService)
      .on<{ notification: AppNotification }>('notification.created')
      .pipe(takeUntilDestroyed())
      .subscribe(({ notification }) => {
        if (notification.type !== 'TASK_COMMENTED') void this.load();
      });
  }

  ngOnInit() {
    void this.load();
  }

  private async load() {
    try {
      this.data.set(await this.api.myDashboard());
    } catch (e) {
      this.ui.error(e);
    }
  }

  priorityClass(t: MyTask) {
    return PRIORITY_CLASSES[t.priority];
  }

  async createOrganization() {
    const result = await this.ui.form({
      title: 'Nova organização',
      submitLabel: 'Criar',
      maxLength: 80,
    });
    if (!result) return;
    try {
      const org = await this.api.createOrganization(result.name);
      await this.workspace.reload();
      await this.router.navigate(['/orgs', org.id]);
    } catch (e) {
      this.ui.error(e);
    }
  }
}
