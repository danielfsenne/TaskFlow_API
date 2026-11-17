import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppNotification, Organization } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { UiService } from '../../shared/dialogs';
import { RoleLabelPipe } from '../../shared/labels';

@Component({
  selector: 'app-organizations',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    RoleLabelPipe,
  ],
  template: `
    <div class="mx-auto max-w-4xl p-4 sm:p-8">
      <header class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">Organizações</h1>
          <p class="text-sm text-slate-500">
            Escolha onde trabalhar ou crie uma nova.
          </p>
        </div>
        <button mat-flat-button (click)="create()">
          <mat-icon>add</mat-icon>
          <span class="hidden sm:inline">Nova organização</span>
          <span class="sm:hidden">Nova</span>
        </button>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (organizations().length === 0) {
        <div
          class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"
        >
          <mat-icon class="!h-10 !w-10 !text-4xl text-slate-400"
            >groups</mat-icon
          >
          <h2 class="mt-2 font-medium">
            Você ainda não participa de nenhuma organização
          </h2>
          <p class="mb-4 text-sm text-slate-500">
            Crie a sua ou peça para alguém te adicionar pelo seu e-mail.
          </p>
          <button mat-flat-button (click)="create()">Criar organização</button>
        </div>
      } @else {
        <ul class="grid gap-3 sm:grid-cols-2">
          @for (org of organizations(); track org.id) {
            <li>
              <a
                [routerLink]="['/orgs', org.id]"
                class="block rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400"
              >
                <div class="flex items-center justify-between gap-2">
                  <h2 class="truncate font-medium">{{ org.name }}</h2>
                  <span
                    class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {{ org.role | roleLabel }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-400">{{ org.slug }}</p>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class OrganizationsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  readonly organizations = signal<Organization[]>([]);
  readonly loading = signal(true);

  constructor() {
    // Alguém me adicionou a uma organização: atualiza a lista na hora.
    inject(RealtimeService)
      .on<{ notification: AppNotification }>('notification.created')
      .pipe(takeUntilDestroyed())
      .subscribe(({ notification }) => {
        if (notification.type === 'MEMBER_ADDED') void this.reload();
      });
  }

  async ngOnInit() {
    await this.reload();
  }

  private async reload() {
    try {
      this.organizations.set(await this.api.organizations());
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  async create() {
    const result = await this.ui.form({
      title: 'Nova organização',
      submitLabel: 'Criar',
      maxLength: 80,
    });
    if (!result) return;
    try {
      const org = await this.api.createOrganization(result.name);
      await this.router.navigate(['/orgs', org.id]);
    } catch (e) {
      this.ui.error(e);
    }
  }
}
