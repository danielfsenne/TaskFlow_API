import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { InvitationPreview } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { RoleLabelPipe } from '../../shared/labels';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-invite',
  imports: [
    LowerCasePipe,
    RouterLink,
    MatButtonModule,
    MatProgressBarModule,
    LogoComponent,
    RoleLabelPipe,
  ],
  template: `
    <main
      class="flex min-h-full flex-col items-center justify-center gap-5 p-4"
    >
      <app-logo [size]="26" />
      <section
        class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6"
        data-testid="invite"
      >
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        } @else if (!invite()) {
          <h1 class="mb-1 text-lg font-semibold text-ink">
            Convite indisponível
          </h1>
          <p class="text-sm text-slate-600">{{ error() }}</p>
          <a
            routerLink="/"
            class="mt-4 inline-block text-sm text-brand-700 hover:underline"
            >Ir para o início</a
          >
        } @else {
          @let i = invite()!;
          <h1 class="mb-1 text-lg font-semibold text-ink">
            Convite para {{ i.organization.name }}
          </h1>
          <p class="mb-5 text-sm text-slate-600">
            {{ i.invitedBy.name }} convidou <strong>{{ i.email }}</strong> para
            entrar como {{ i.role | roleLabel | lowercase }}.
          </p>

          @if (error()) {
            <p
              class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {{ error() }}
            </p>
          }

          @if (i.expired) {
            <p class="text-sm text-slate-600">
              Este convite expirou. Peça para {{ i.invitedBy.name }} enviar um
              novo.
            </p>
          } @else if (!auth.isAuthenticated()) {
            <div class="flex flex-col gap-2">
              <a
                mat-flat-button
                routerLink="/register"
                [queryParams]="{ email: i.email, returnUrl: here() }"
                >Criar conta e aceitar</a
              >
              <a
                mat-stroked-button
                routerLink="/login"
                [queryParams]="{ returnUrl: here() }"
                >Já tenho conta</a
              >
            </div>
          } @else if (wrongAccount()) {
            <p class="mb-4 text-sm text-slate-600">
              Você está conectado como {{ auth.user()?.email }}. Para aceitar,
              entre com {{ i.email }}.
            </p>
            <button mat-stroked-button (click)="switchAccount()">
              Entrar com outra conta
            </button>
          } @else {
            <button
              mat-flat-button
              class="w-full"
              (click)="accept()"
              [disabled]="accepting()"
            >
              Entrar na organização
            </button>
          }
        }
      </section>
    </main>
  `,
})
export class InviteComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceService);

  /** ?token= do link do e-mail. */
  readonly token = input<string>();

  readonly invite = signal<InvitationPreview | null>(null);
  readonly loading = signal(true);
  readonly accepting = signal(false);
  readonly error = signal<string | null>(null);
  readonly here = computed(() => `/invite?token=${this.token() ?? ''}`);
  readonly wrongAccount = computed(
    () =>
      !!this.invite() &&
      this.auth.user()?.email.toLowerCase() !== this.invite()!.email,
  );

  constructor() {
    effect(() => void this.load(this.token()));
  }

  private async load(token: string | undefined) {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (!token) throw new Error();
      this.invite.set(await this.api.invitationPreview(token));
    } catch (e) {
      this.invite.set(null);
      this.error.set(
        apiErrorMessage(
          e,
          'Este link de convite está incompleto ou não existe.',
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async accept() {
    this.accepting.set(true);
    this.error.set(null);
    try {
      const { organizationId } = await this.api.acceptInvitation(this.token()!);
      await this.workspace.reload();
      await this.router.navigate(['/orgs', organizationId]);
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Não foi possível aceitar o convite.'));
    } finally {
      this.accepting.set(false);
    }
  }

  async switchAccount() {
    await this.auth.logout();
    await this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.here() },
    });
  }
}
