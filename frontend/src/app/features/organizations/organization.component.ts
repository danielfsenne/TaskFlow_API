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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { DashboardStats, Organization, Project } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { UiService } from '../../shared/dialogs';
import { RoleLabelPipe, roleAtLeast } from '../../shared/labels';
import { StatsPanelComponent } from '../dashboard/stats-panel.component';
import { MembersComponent } from './members.component';

@Component({
  selector: 'app-organization',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTabsModule,
    RoleLabelPipe,
    MembersComponent,
    StatsPanelComponent,
  ],
  template: `
    <div class="page">
      @if (org(); as org) {
        <header class="mb-4 flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-semibold text-ink">
              {{ org.name }}
            </h1>
            <p class="text-[13px] text-slate-500">
              {{ org.role | roleLabel }}
              @if (org._count) {
                · {{ org._count.members }}
                {{ org._count.members === 1 ? 'membro' : 'membros' }}
              }
            </p>
          </div>
          <button
            mat-flat-button
            (click)="createProject()"
            class="!hidden sm:!inline-flex"
          >
            Novo projeto
          </button>
          @if (isAdmin()) {
            <button
              mat-icon-button
              [matMenuTriggerFor]="orgMenu"
              aria-label="Opções da organização"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #orgMenu="matMenu" xPosition="before">
              <button mat-menu-item (click)="rename()">
                <mat-icon>edit</mat-icon>Renomear
              </button>
              @if (org.role === 'OWNER') {
                <button mat-menu-item (click)="remove()" class="!text-red-700">
                  <mat-icon class="!text-red-700">delete</mat-icon>Excluir
                  organização
                </button>
              }
            </mat-menu>
          }
        </header>

        <mat-tab-group
          class="page-tabs"
          animationDuration="0ms"
          mat-stretch-tabs="false"
          mat-align-tabs="start"
          [selectedIndex]="tab()"
          (selectedIndexChange)="tab.set($event)"
        >
          <mat-tab label="Projetos">
            <div class="py-4">
              <div
                class="mb-3 flex flex-wrap items-center justify-between gap-3"
              >
                <mat-slide-toggle
                  [checked]="showArchived()"
                  (change)="showArchived.set($event.checked)"
                >
                  Mostrar arquivados
                </mat-slide-toggle>
                <button
                  mat-stroked-button
                  (click)="createProject()"
                  class="sm:!hidden"
                >
                  <mat-icon>add</mat-icon>Novo
                </button>
              </div>

              @if (loadingProjects()) {
                <mat-progress-bar mode="indeterminate" />
              } @else if (projects().length === 0) {
                <div class="card px-4 py-10 text-center">
                  <p class="text-[13px] font-medium text-ink">
                    {{
                      showArchived()
                        ? 'Nenhum projeto arquivado'
                        : 'Nenhum projeto ainda'
                    }}
                  </p>
                  @if (!showArchived()) {
                    <button
                      mat-stroked-button
                      class="!mt-3"
                      (click)="createProject()"
                    >
                      Criar projeto
                    </button>
                  }
                </div>
              } @else {
                <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  @for (p of projects(); track p.id) {
                    @let st = progress().get(p.id);
                    <li>
                      <a
                        [routerLink]="['/projects', p.id]"
                        class="card card-hover flex h-full flex-col p-4"
                        [attr.data-project]="p.name"
                      >
                        <div class="flex items-center gap-2">
                          <h2
                            class="min-w-0 flex-1 truncate font-medium text-ink"
                          >
                            {{ p.name }}
                          </h2>
                          @if (p.archived) {
                            <span class="chip bg-amber-50 text-amber-800"
                              >Arquivado</span
                            >
                          }
                        </div>
                        <p
                          class="mt-1 line-clamp-2 flex-1 text-[13px] text-slate-500"
                        >
                          {{ p.description || 'Sem descrição' }}
                        </p>

                        @if (st && st.total > 0) {
                          <div class="mt-3">
                            <div
                              class="mb-1 flex justify-between text-xs text-slate-500"
                            >
                              <span
                                >{{ st.completed }}/{{
                                  st.total
                                }}
                                concluídas</span
                              >
                              @if (st.overdue) {
                                <span class="font-medium text-critical"
                                  >{{ st.overdue }} atrasada{{
                                    st.overdue > 1 ? 's' : ''
                                  }}</span
                                >
                              }
                            </div>
                            <div
                              class="h-1.5 overflow-hidden rounded-full bg-slate-100"
                            >
                              <div
                                class="h-full rounded-full bg-series-completed"
                                [style.width.%]="
                                  (st.completed / st.total) * 100
                                "
                              ></div>
                            </div>
                          </div>
                        }

                        <p class="mt-3 text-xs text-slate-400">
                          {{ p._count.boards }}
                          {{ p._count.boards === 1 ? 'quadro' : 'quadros' }} ·
                          {{ p.createdBy.name }}
                        </p>
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
                  <app-stats-panel [stats]="s" breakdownKind="projects" />
                } @else {
                  <mat-progress-bar mode="indeterminate" />
                }
              </div>
            </ng-template>
          </mat-tab>

          <mat-tab label="Membros">
            <ng-template matTabContent>
              <app-members class="block py-4" [organization]="org" />
            </ng-template>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
})
export class OrganizationComponent {
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);

  readonly orgId = input.required<string>();

  readonly org = signal<Organization | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly stats = signal<DashboardStats | null>(null);
  readonly loadingProjects = signal(true);
  readonly showArchived = signal(false);
  readonly tab = signal(0);
  readonly isAdmin = computed(() => roleAtLeast(this.org()?.role, 'ADMIN'));
  readonly progress = computed(
    () => new Map((this.stats()?.breakdown ?? []).map((b) => [b.id, b])),
  );

  constructor() {
    effect(() => {
      const id = this.orgId();
      this.workspace.activeOrgId.set(id);
      this.tab.set(0);
      void this.loadOrg(id);
      void this.loadStats(id);
    });
    effect(() => void this.loadProjects(this.orgId(), this.showArchived()));
  }

  private async loadOrg(id: string) {
    this.org.set(null);
    try {
      this.org.set(await this.api.organization(id));
    } catch (e) {
      this.ui.error(e);
      await this.router.navigate(['/']);
    }
  }

  private async loadStats(id: string) {
    this.stats.set(null);
    try {
      this.stats.set(await this.api.organizationDashboard(id));
    } catch {
      // a página funciona sem os indicadores
    }
  }

  private async loadProjects(id: string, archived: boolean) {
    this.loadingProjects.set(true);
    try {
      this.projects.set(await this.api.projects(id, archived));
    } catch {
      this.projects.set([]);
    } finally {
      this.loadingProjects.set(false);
    }
  }

  async createProject() {
    const result = await this.ui.form({
      title: 'Novo projeto',
      submitLabel: 'Criar',
      withDescription: true,
    });
    if (!result) return;
    try {
      const project = await this.api.createProject(
        this.orgId(),
        result.name,
        result.description,
      );
      await this.router.navigate(['/projects', project.id]);
    } catch (e) {
      this.ui.error(e);
    }
  }

  async rename() {
    const org = this.org();
    if (!org) return;
    const result = await this.ui.form({
      title: 'Renomear organização',
      name: org.name,
      maxLength: 80,
    });
    if (!result) return;
    try {
      const updated = await this.api.updateOrganization(org.id, result.name);
      this.org.set({ ...org, ...updated, role: org.role });
      void this.workspace.reload();
    } catch (e) {
      this.ui.error(e);
    }
  }

  async remove() {
    const org = this.org();
    if (!org) return;
    const ok = await this.ui.confirm({
      title: 'Excluir organização?',
      message: `"${org.name}" e todos os projetos, quadros e tarefas dela serão apagados. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteOrganization(org.id);
      this.ui.toast('Organização excluída');
      await this.workspace.reload();
      await this.router.navigate(['/']);
    } catch (e) {
      this.ui.error(e);
    }
  }
}
