import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

/** Moldura das telas logadas: barra superior e área de conteúdo. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
  ],
  template: `
    <div class="flex h-full flex-col">
      <mat-toolbar
        class="!h-14 shrink-0 gap-2 border-b border-slate-200 !bg-white"
      >
        <a routerLink="/" class="text-lg font-semibold text-slate-900"
          >TaskFlow</a
        >
        <span class="flex-1"></span>
        <button
          mat-button
          [matMenuTriggerFor]="userMenu"
          class="!text-slate-700"
        >
          <mat-icon>account_circle</mat-icon>
          <span class="hidden sm:inline">{{ auth.user()?.name }}</span>
        </button>
        <mat-menu #userMenu="matMenu" xPosition="before">
          <div class="px-4 py-2 text-xs text-slate-500">
            {{ auth.user()?.email }}
          </div>
          <button mat-menu-item (click)="auth.logout()">
            <mat-icon>logout</mat-icon>
            Sair
          </button>
        </mat-menu>
      </mat-toolbar>

      <div class="min-h-0 flex-1 overflow-auto">
        <router-outlet />
      </div>
    </div>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
}
