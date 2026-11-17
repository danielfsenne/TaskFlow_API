import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth/auth.service';
import { AppNotification, Organization } from './models';
import { RealtimeService } from './realtime.service';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService);
  readonly organizations = signal<Organization[]>([]);
  readonly loaded = signal(false);
  readonly activeOrgId = signal<string | null>(null);

  constructor() {
    const auth = inject(AuthService);
    effect(() => {
      const loggedIn = auth.isAuthenticated();
      untracked(() => {
        if (loggedIn) void this.reload();
        else {
          this.organizations.set([]);
          this.loaded.set(false);
        }
      });
    });
    inject(RealtimeService)
      .on<{ notification: AppNotification }>('notification.created')
      .subscribe(({ notification }) => {
        if (notification.type === 'MEMBER_ADDED') void this.reload();
      });
  }

  async reload() {
    try {
      this.organizations.set(await this.api.organizations());
    } catch {
      // mantém a lista anterior
    } finally {
      this.loaded.set(true);
    }
  }
}
