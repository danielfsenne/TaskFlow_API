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
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { BoardSummary, Organization, Project } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { roleAtLeast } from '../../shared/labels';

@Component({
  selector: 'app-project',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="mx-auto max-w-5xl p-4 sm:p-8">
      @if (project(); as p) {
        <nav class="mb-2 flex gap-1 text-sm text-slate-500">
          <a routerLink="/" class="hover:underline">Organizações</a>
          <span>/</span>
          <a
            [routerLink]="['/orgs', p.organizationId]"
            class="truncate hover:underline"
            >{{ org()?.name }}</a
          >
        </nav>

        <header class="mb-6 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="flex items-center gap-2 text-2xl font-semibold">
              <span class="truncate">{{ p.name }}</span>
              @if (p.archived) {
                <span
                  class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800"
                  >Arquivado</span
                >
              }
            </h1>
            @if (p.description) {
              <p class="mt-1 whitespace-pre-line text-sm text-slate-600">
                {{ p.description }}
              </p>
            }
          </div>
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
          <p class="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Este projeto está arquivado: dá para ver tudo, mas nada pode ser
            alterado.
          </p>
        }

        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-medium">Quadros</h2>
          @if (!p.archived) {
            <button mat-stroked-button (click)="createBoard()">
              <mat-icon>add</mat-icon>Novo quadro
            </button>
          }
        </div>

        @if (boards().length === 0) {
          <p
            class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500"
          >
            Nenhum quadro ainda. Um quadro novo já vem com as colunas "A fazer",
            "Em andamento" e "Concluído".
          </p>
        } @else {
          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (b of boards(); track b.id) {
              <li>
                <a
                  [routerLink]="['/boards', b.id]"
                  class="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400"
                >
                  <div class="flex items-center gap-2">
                    <mat-icon class="text-slate-400">view_kanban</mat-icon>
                    <h3 class="truncate font-medium">{{ b.name }}</h3>
                  </div>
                  <p class="mt-2 text-xs text-slate-400">
                    {{ b._count.columns }} colunas ·
                    {{ b._count.tasks }} tarefas · criado em
                    {{ b.createdAt | date: 'shortDate' }}
                  </p>
                </a>
              </li>
            }
          </ul>
        }
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

  readonly isAdmin = computed(() => roleAtLeast(this.org()?.role, 'ADMIN'));
  /** Mesma regra do backend: criador do projeto ou ADMIN+. */
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
      this.org.set(await this.api.organization(project.organizationId));
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
