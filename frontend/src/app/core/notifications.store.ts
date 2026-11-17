import { effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { ApiService } from './api.service';
import { AuthService } from './auth/auth.service';
import { AppNotification } from './models';
import { RealtimeService } from './realtime.service';

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
  loaded: boolean;
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loaded: false,
};

export const NotificationsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withMethods((store, api = inject(ApiService)) => ({
    async load() {
      try {
        const page = await api.notifications();
        patchState(store, {
          items: page.items,
          unreadCount: page.unreadCount,
          nextCursor: page.nextCursor,
          loaded: true,
        });
      } catch {
        // o sino fica vazio até a próxima tentativa
      }
    },

    async loadMore() {
      const cursor = store.nextCursor();
      if (!cursor) return;
      const page = await api.notifications(cursor);
      const known = new Set(store.items().map((n) => n.id));
      patchState(store, {
        items: [
          ...store.items(),
          ...page.items.filter((n) => !known.has(n.id)),
        ],
        nextCursor: page.nextCursor,
        unreadCount: page.unreadCount,
      });
    },

    receive(notification: AppNotification) {
      if (store.items().some((n) => n.id === notification.id)) return;
      patchState(store, {
        items: [notification, ...store.items()],
        unreadCount: store.unreadCount() + (notification.readAt ? 0 : 1),
      });
    },

    async markRead(id: string) {
      const n = store.items().find((x) => x.id === id);
      if (!n || n.readAt) return;
      patchState(store, {
        items: store
          .items()
          .map((x) =>
            x.id === id ? { ...x, readAt: new Date().toISOString() } : x,
          ),
        unreadCount: Math.max(0, store.unreadCount() - 1),
      });
      await api.markNotificationRead(id).catch(() => undefined);
    },

    async markAllRead() {
      const now = new Date().toISOString();
      patchState(store, {
        items: store.items().map((x) => (x.readAt ? x : { ...x, readAt: now })),
        unreadCount: 0,
      });
      await api.markAllNotificationsRead().catch(() => undefined);
    },

    async remove(id: string) {
      const n = store.items().find((x) => x.id === id);
      patchState(store, {
        items: store.items().filter((x) => x.id !== id),
        unreadCount: store.unreadCount() - (n && !n.readAt ? 1 : 0),
      });
      await api.deleteNotification(id).catch(() => undefined);
    },

    reset() {
      patchState(store, initialState);
    },
  })),

  withHooks({
    onInit(
      store,
      auth = inject(AuthService),
      realtime = inject(RealtimeService),
    ) {
      effect(() => {
        const loggedIn = auth.isAuthenticated();
        untracked(() => (loggedIn ? void store.load() : store.reset()));
      });
      // pega o que chegou entre o login e a conexão do socket
      effect(() => {
        if (realtime.connected()) untracked(() => void store.load());
      });
      realtime
        .on<{ notification: AppNotification }>('notification.created')
        .pipe(takeUntilDestroyed())
        .subscribe(({ notification }) => store.receive(notification));
      realtime.reconnected$
        .pipe(takeUntilDestroyed())
        .subscribe(() => void store.load());
    },
  }),
);
