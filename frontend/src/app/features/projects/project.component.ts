import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  BoardSummary,
  DashboardStats,
  Organization,
  Project,
} from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { UiService } from '../../shared/dialogs';
import { roleAtLeast } from '../../shared/labels';
import { StatsPanelComponent } from '../dashboard/stats-panel.component';

@Component({
  selector: 'app-project',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTabsModule,
    StatsPanelComponent,
  ],
  template: `
    <div class="page">
      @if (project(); as p) {
        <nav class="mb-2 flex items-center gap-1 text-[13px] text-slate-500">
          <a
            [routerLink]="['/orgs', p.organizationId]"
            class="truncate hover:underline"
            >{{ org()?.name }}</a
          >
          <mat-icon class="!h-4 !w-4 !text-base text-slate-300"
            >chevron_right</mat-icon
          >
          <span class="truncate text-slate-700">{{ p.name }}</span>
        </nav>

        <header class="mb-4 flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="flex items-center gap-2 text-xl font-semibold text-ink">
              <span class="truncate">{{ p.name }}</span>
              @if (p.archived) {
                <span class="chip shrink-0 bg-amber-50 text-amber-800"
                  >Arquivado</span
                >
              }
            </h1>
            @if (p.description) {
              <p class="mt-0.5 whitespace-pre-line text-[13px] text-slate-500">
                {{ p.description }}
              </p>
            }
          </div>
          @if (!p.archived) {
            <button
              mat-flat-button
              (click)="createBoard()"
              class="!hidden sm:!inline-flex"
            >
              Novo quadro
            </button>
          }
          @if (canManage() || isAdmin()) {
            <button
              mat-icon-button
              [matMenuTriggerFor]="menu"
              aria-label="Opções do projeto"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu" xPosition="before">
              @if (canManage()) {
                @if (!p.archived) {
                  <button mat-menu-item (click)="edit()">
                    <mat-icon>edit</mat-icon>Editar
                  </button>
                }
                <button mat-menu-item (click)="toggleArchive()">
                  <mat-icon>{{
                    p.archived ? 'unarchive' : 'archive'
                  }}</mat-icon>
                  {{ p.archived ? 'Desarquivar' : 'Arquivar' }}
                </button>
              }
              @if (isAdmin()) {
                <button mat-menu-item (click)="remove()" class="!text-red-700">
                  <mat-icon class="!text-red-700">delete</mat-icon>Excluir
                  projeto
                </button>
              }
            </mat-menu>
          }
        </header>

        @if (p.archived) {
          <p
            class="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
          >
            Este projeto está arquivado: dá para ver tudo, mas nada pode ser
            alterado.
          </p>
        }

        <mat-tab-group
          class="page-tabs"
          animationDuration="0ms"
          mat-stretch-tabs="false"
          mat-align-tabs="start"
        >
          <mat-tab label="Quadros">
            <div class="py-4">
              @if (!p.archived) {
                <button
                  mat-stroked-button
                  (click)="createBoard()"
                  class="!mb-3 sm:!hidden"
                >
                  Novo quadro
                </button>
              }
              @if (boards().length === 0) {
                <div class="card px-4 py-10 text-center">
                  <p class="text-[13px] font-medium text-ink">
                    Nenhum quadro ainda
                  </p>
                  <p class="mt-1 text-[13px] text-slate-500">
                    Um quadro novo já vem com as colunas "A fazer", "Em
                    andamento" e "Concluído".
                  </p>
                  @if (!p.archived) {
                    <button
                      mat-stroked-button
                      class="!mt-3"
                      (click)="createBoard()"
                    >
                      Criar quadro
                    </button>
                  }
                </div>
              } @else {
                <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  @for (b of boards(); track b.id) {
                    @let st = progress().get(b.id);
                    <li>
                      <a
                        [routerLink]="['/boards', b.id]"
                        class="card card-hover block"
                        [attr.data-board]="b.name"
                      >
                        <div class="p-4">
                          <h3 class="truncate font-medium text-ink">
                            {{ b.name }}
                          </h3>
                          <p class="mt-1 text-xs text-slate-500">
                            {{ b._count.tasks }}
                            {{ b._count.tasks === 1 ? 'tarefa' : 'tarefas' }} ·
                            {{ b._count.columns }} colunas · criado em
                            {{ b.createdAt | date: 'dd/MM/yyyy' }}
                          </p>
                          @if (st && st.total > 0) {
                            <div
                              class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                              [attr.title]="
                                st.completed + ' de ' + st.total + ' concluídas'
                              "
                            >
                              <div
                                class="h-full rounded-full bg-series-completed"
                                [style.width.%]="
                                  (st.completed / st.total) * 100
                                "
                              ></div>
                            </div>
                          }
                        </div>
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>
          </mat-tab>

          <mat-tab label="Visão geral">
            <ng-template matTabContent>
              <div class="py-4">
                @if (stats(); as s) {
                  <app-stats-panel [stats]="s" breakdownKind="boards" />
                } @else {
                  <mat-progress-bar mode="indeterminate" />
                }
              </div>
            </ng-template>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
})
export class ProjectComponent {
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly projectId = input.required<string>();

  readonly project = signal<Project | null>(null);
  readonly org = signal<Organization | null>(null);
  readonly boards = signal<BoardSummary[]>([]);
  readonly stats = signal<DashboardStats | null>(null);
  private readonly workspace = inject(WorkspaceService);
  readonly progress = computed(
    () => new Map((this.stats()?.breakdown ?? []).map((b) => [b.id, b])),
  );

  readonly isAdmin = computed(() => roleAtLeast(this.org()?.role, 'ADMIN'));
  readonly canManage = computed(
    () =>
      this.isAdmin() || this.project()?.createdById === this.auth.user()?.id,
  );

  constructor() {
    effect(() => void this.load(this.projectId()));
  }

  private async load(id: string) {
    this.project.set(null);
    try {
      const [project, boards] = await Promise.all([
        this.api.project(id),
        this.api.boards(id),
      ]);
      this.boards.set(boards);
      this.workspace.activeOrgId.set(project.organizationId);
      this.org.set(await this.api.organization(project.organizationId));
      this.api.projectDashboard(id).then(
        (s) => this.stats.set(s),
        () => undefined,
      );
      this.project.set(project);
    } catch (e) {
      this.ui.error(e);
      await this.router.navigate(['/']);
    }
  }

  async createBoard() {
    const result = await this.ui.form({
      title: 'Novo quadro',
      submitLabel: 'Criar',
      minLength: 1,
      maxLength: 80,
    });
    if (!result) return;
    try {
      const board = await this.api.createBoard(this.projectId(), result.name);
      await this.router.navigate(['/boards', board.id]);
    } catch (e) {
      this.ui.error(e);
    }
  }

  async edit() {
    const p = this.project();
    if (!p) return;
    const result = await this.ui.form({
      title: 'Editar projeto',
      name: p.name,
      withDescription: true,
      description: p.description ?? '',
    });
    if (!result) return;
    try {
      this.project.set(
        await this.api.updateProject(p.id, {
          name: result.name,
          description: result.description,
        }),
      );
    } catch (e) {
      this.ui.error(e);
    }
  }

  async toggleArchive() {
    const p = this.project();
    if (!p) return;
    try {
      this.project.set(
        await this.api.updateProject(p.id, { archived: !p.archived }),
      );
      this.ui.toast(p.archived ? 'Projeto desarquivado' : 'Projeto arquivado');
    } catch (e) {
      this.ui.error(e);
    }
  }

  async remove() {
    const p = this.project();
    if (!p) return;
    const ok = await this.ui.confirm({
      title: 'Excluir projeto?',
      message: `"${p.name}" e todos os quadros e tarefas dele serão apagados. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteProject(p.id);
      this.ui.toast('Projeto excluído');
      await this.router.navigate(['/orgs', p.organizationId]);
    } catch (e) {
      this.ui.error(e);
    }
  }
}
