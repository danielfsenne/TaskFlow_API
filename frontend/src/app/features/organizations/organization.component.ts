import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Organization, Project } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { RoleLabelPipe, roleAtLeast } from '../../shared/labels';
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
  ],
  template: `
    <div class="mx-auto max-w-5xl p-4 sm:p-8">
      <nav class="mb-2 text-sm text-slate-500">
        <a routerLink="/" class="hover:underline">Organizações</a>
      </nav>

      @if (org(); as org) {
        <header class="mb-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-semibold">{{ org.name }}</h1>
            <p class="text-sm text-slate-500">Seu papel: {{ org.role | roleLabel }}</p>
          </div>
          @if (isAdmin()) {
            <button mat-icon-button [matMenuTriggerFor]="orgMenu" aria-label="Opções da organização">
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #orgMenu="matMenu" xPosition="before">
              <button mat-menu-item (click)="rename()">
                <mat-icon>edit</mat-icon>Renomear
              </button>
              @if (org.role === 'OWNER') {
                <button mat-menu-item (click)="remove()" class="!text-red-700">
                  <mat-icon class="!text-red-700">delete</mat-icon>Excluir organização
                </button>
              }
            </mat-menu>
          }
        </header>

        <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false">
          <mat-tab label="Projetos">
            <div class="py-4">
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <mat-slide-toggle [checked]="showArchived()" (change)="showArchived.set($event.checked)">
                  Mostrar arquivados
                </mat-slide-toggle>
                <button mat-flat-button (click)="createProject()">
                  <mat-icon>add</mat-icon><span class="hidden sm:inline">Novo projeto</span><span class="sm:hidden">Novo</span>
                </button>
              </div>

              @if (loadingProjects()) {
                <mat-progress-bar mode="indeterminate" />
              } @else if (projects().length === 0) {
                <p class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  {{ showArchived() ? 'Nenhum projeto arquivado.' : 'Nenhum projeto ainda. Crie o primeiro!' }}
                </p>
              } @else {
                <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  @for (p of projects(); track p.id) {
                    <li>
                      <a
                        [routerLink]="['/projects', p.id]"
                        class="flex h-full flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400"
                      >
                        <h2 class="truncate font-medium">{{ p.name }}</h2>
                        <p class="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">
                          {{ p.description || 'Sem descrição' }}
                        </p>
                        <p class="mt-3 text-xs text-slate-400">
                          {{ p._count.boards }} {{ p._count.boards === 1 ? 'quadro' : 'quadros' }} ·
                          criado por {{ p.createdBy.name }}
                        </p>
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>
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

  /** Parâmetro de rota. */
  readonly orgId = input.required<string>();

  readonly org = signal<Organization | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly loadingProjects = signal(true);
  readonly showArchived = signal(false);
  readonly isAdmin = computed(() => roleAtLeast(this.org()?.role, 'ADMIN'));

  constructor() {
    effect(() => void this.loadOrg(this.orgId()));
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
      const project = await this.api.createProject(this.orgId(), result.name, result.description);
      await this.router.navigate(['/projects', project.id]);
    } catch (e) {
      this.ui.error(e);
    }
  }

  async rename() {
    const org = this.org();
    if (!org) return;
    const result = await this.ui.form({ title: 'Renomear organização', name: org.name, maxLength: 80 });
    if (!result) return;
    try {
      const updated = await this.api.updateOrganization(org.id, result.name);
      this.org.set({ ...org, ...updated, role: org.role });
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
      await this.router.navigate(['/']);
    } catch (e) {
      this.ui.error(e);
    }
  }
}
