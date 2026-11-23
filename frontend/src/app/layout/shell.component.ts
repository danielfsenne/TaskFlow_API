import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth/auth.service';
import { ThemeChoice, ThemeService } from '../core/theme.service';
import { WorkspaceService } from '../core/workspace.service';
import { AvatarComponent } from '../shared/avatar.component';
import { UiService } from '../shared/dialogs';
import { LogoComponent } from '../shared/logo.component';
import { NotificationsMenuComponent } from './notifications-menu.component';
import { SearchBoxComponent } from './search-box.component';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    NotificationsMenuComponent,
    SearchBoxComponent,
    AvatarComponent,
    LogoComponent,
  ],
  styles: `
    .nav-link {
      @apply flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 hover:text-ink;
    }
    .nav-link.active {
      @apply bg-slate-100 font-medium text-ink;
    }
  `,
  template: `
    <div class="flex h-full">
      @if (menuOpen()) {
        <div
          class="fixed inset-0 z-30 bg-black/30 lg:hidden"
          (click)="menuOpen.set(false)"
        ></div>
      }

      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()"
        data-testid="sidebar"
      >
        <a routerLink="/" class="flex h-12 items-center px-4">
          <app-logo />
        </a>

        <nav
          class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-2"
        >
          <a
            routerLink="/"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            class="nav-link"
          >
            <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">home</mat-icon>
            Início
          </a>

          <div>
            <div class="mb-1 flex items-center justify-between px-2">
              <span class="text-xs text-slate-400">Organizações</span>
              <button
                class="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-ink"
                (click)="createOrganization()"
                matTooltip="Nova organização"
                aria-label="Nova organização"
              >
                <mat-icon class="!h-4 !w-4 !text-base">add</mat-icon>
              </button>
            </div>
            @for (org of workspace.organizations(); track org.id) {
              <a
                [routerLink]="['/orgs', org.id]"
                class="nav-link"
                [class.active]="workspace.activeOrgId() === org.id"
              >
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-slate-200 text-[10px] font-semibold text-slate-600"
                  >{{ org.name.charAt(0).toUpperCase() }}</span
                >
                <span class="min-w-0 flex-1 truncate">{{ org.name }}</span>
              </a>
            } @empty {
              @if (workspace.loaded()) {
                <p class="px-2 text-xs text-slate-400">Nenhuma ainda.</p>
              }
            }
          </div>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header
          class="flex h-12 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2 sm:px-4"
        >
          <button
            mat-icon-button
            class="lg:!hidden"
            (click)="menuOpen.set(true)"
            aria-label="Abrir menu"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <app-logo class="lg:!hidden" [withName]="false" />
          <div class="mx-2 flex min-w-0 flex-1 justify-center">
            <app-search-box />
          </div>
          <app-notifications-menu />
          <button
            class="ml-1 flex items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-100"
            [matMenuTriggerFor]="userMenu"
            data-testid="user-menu"
          >
            <app-avatar
              [name]="auth.user()?.name"
              [url]="auth.user()?.avatarUrl"
              [seed]="auth.user()?.id"
              [size]="26"
            />
            <span class="hidden text-[13px] text-slate-700 sm:inline">{{
              auth.user()?.name
            }}</span>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <div class="px-4 py-2 text-xs text-slate-500">
              {{ auth.user()?.email }}
            </div>
            <a mat-menu-item routerLink="/profile">
              <mat-icon>person</mat-icon>
              Meu perfil
            </a>
            <button mat-menu-item [matMenuTriggerFor]="themeMenu">
              <mat-icon>contrast</mat-icon>
              Tema
            </button>
            <button mat-menu-item (click)="auth.logout()">
              <mat-icon>logout</mat-icon>
              Sair
            </button>
          </mat-menu>
          <mat-menu #themeMenu="matMenu">
            @for (o of themeOptions; track o.value) {
              <button
                mat-menu-item
                (click)="theme.set(o.value)"
                [attr.data-theme-option]="o.value"
              >
                <mat-icon>{{
                  theme.choice() === o.value ? 'check' : o.icon
                }}</mat-icon>
                {{ o.label }}
              </button>
            }
          </mat-menu>
        </header>

        <main class="min-h-0 flex-1 overflow-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly workspace = inject(WorkspaceService);
  readonly theme = inject(ThemeService);
  readonly themeOptions: { value: ThemeChoice; label: string; icon: string }[] =
    [
      { value: 'light', label: 'Claro', icon: 'light_mode' },
      { value: 'dark', label: 'Escuro', icon: 'dark_mode' },
      { value: 'system', label: 'Igual ao sistema', icon: 'computer' },
    ];
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  readonly menuOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
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
