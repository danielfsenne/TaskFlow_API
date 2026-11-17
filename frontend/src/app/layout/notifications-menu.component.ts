import { Component, inject, viewChild } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AppNotification } from '../core/models';
import { NotificationsStore } from '../core/notifications.store';
import { InitialsPipe } from '../shared/labels';
import { RelativeTimePipe } from '../shared/relative-time.pipe';

/** Texto de cada tipo de notificação. */
export function describe(n: AppNotification): {
  text: string;
  detail?: string;
} {
  const who = n.payload.actor?.name ?? 'Alguém';
  switch (n.type) {
    case 'MEMBER_ADDED':
      return {
        text: `${who} adicionou você à organização ${n.payload.organizationName}`,
      };
    case 'TASK_ASSIGNED':
      return {
        text: `${who} atribuiu a você "${n.payload.taskTitle}"`,
        detail: n.payload.projectName,
      };
    case 'TASK_COMMENTED':
      return {
        text: `${who} comentou em "${n.payload.taskTitle}"`,
        detail: n.payload.excerpt,
      };
    default:
      return { text: 'Nova notificação' };
  }
}

@Component({
  selector: 'app-notifications-menu',
  imports: [
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    InitialsPipe,
    RelativeTimePipe,
  ],
  template: `
    <button
      mat-icon-button
      [matMenuTriggerFor]="menu"
      aria-label="Notificações"
      class="!text-slate-700"
      data-testid="bell"
    >
      <mat-icon
        [matBadge]="store.unreadCount() > 9 ? '9+' : store.unreadCount()"
        [matBadgeHidden]="store.unreadCount() === 0"
        matBadgeColor="warn"
        aria-hidden="false"
      >
        notifications
      </mat-icon>
    </button>

    <mat-menu #menu="matMenu" xPosition="before" class="notifications-panel">
      <div
        class="w-[22rem] max-w-[90vw]"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <div
          class="flex items-center justify-between border-b border-slate-100 px-4 py-2"
        >
          <span class="font-medium">Notificações</span>
          @if (store.unreadCount() > 0) {
            <button
              class="text-xs text-blue-700 hover:underline"
              (click)="store.markAllRead()"
            >
              Marcar todas como lidas
            </button>
          }
        </div>

        <ul class="max-h-[60vh] overflow-y-auto">
          @for (n of store.items(); track n.id) {
            @let d = describe(n);
            <li
              class="group flex cursor-pointer gap-3 border-b border-slate-50 px-4 py-3 hover:bg-slate-50"
              [class.bg-blue-50]="!n.readAt"
              (click)="open(n)"
              [attr.data-notification]="n.type"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium"
              >
                {{ n.payload.actor?.name | initials }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm leading-snug">{{ d.text }}</p>
                @if (d.detail) {
                  <p class="truncate text-xs text-slate-500">{{ d.detail }}</p>
                }
                <p class="mt-0.5 text-xs text-slate-400">
                  {{ n.createdAt | relativeTime }}
                </p>
              </div>
              <div class="flex flex-col items-center gap-1">
                @if (!n.readAt) {
                  <span
                    class="mt-1 h-2 w-2 rounded-full bg-blue-600"
                    aria-label="Não lida"
                  ></span>
                }
                <button
                  class="invisible text-slate-400 hover:text-slate-700 group-hover:visible"
                  (click)="$event.stopPropagation(); store.remove(n.id)"
                  matTooltip="Remover"
                  aria-label="Remover notificação"
                >
                  <mat-icon class="!text-base">close</mat-icon>
                </button>
              </div>
            </li>
          } @empty {
            <li class="px-4 py-8 text-center text-sm text-slate-400">
              Nada por aqui ainda.
            </li>
          }
        </ul>

        @if (store.nextCursor()) {
          <button
            class="w-full py-2 text-sm text-blue-700 hover:bg-slate-50"
            (click)="store.loadMore()"
          >
            Ver mais
          </button>
        }
      </div>
    </mat-menu>
  `,
})
export class NotificationsMenuComponent {
  readonly store = inject(NotificationsStore);
  private readonly router = inject(Router);
  readonly describe = describe;
  private readonly trigger = viewChild.required(MatMenuTrigger);

  async open(n: AppNotification) {
    // O painel impede o fechamento automático (para "marcar todas" e "remover"),
    // então ao abrir um item é preciso fechar o menu explicitamente.
    this.trigger().closeMenu();
    void this.store.markRead(n.id);
    if (n.type === 'MEMBER_ADDED' && n.payload.organizationId) {
      await this.router.navigate(['/orgs', n.payload.organizationId]);
    } else if (n.payload.boardId && n.payload.taskId) {
      await this.router.navigate(['/boards', n.payload.boardId], {
        queryParams: { task: n.payload.taskId },
      });
    }
  }
}
