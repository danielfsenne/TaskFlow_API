import { Component, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UiService } from '../../shared/dialogs';
import { LogoComponent } from '../../shared/logo.component';

export function passwordsMatch(
  group: AbstractControl,
): ValidationErrors | null {
  const { password, confirm } = group.value as Record<string, string>;
  return password && confirm && password !== confirm
    ? { mismatch: true }
    : null;
}

@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    LogoComponent,
  ],
  template: `
    <main
      class="flex min-h-full flex-col items-center justify-center gap-5 p-4"
    >
      <app-logo [size]="26" />
      <section
        class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6"
      >
        <h1 class="mb-1 text-lg font-semibold text-ink">Criar senha nova</h1>

        @if (!token()) {
          <p class="mt-2 text-sm text-slate-600">
            Este link está incompleto. Peça um novo na tela de
            <a
              routerLink="/forgot-password"
              class="text-brand-700 hover:underline"
              >esqueci minha senha</a
            >.
          </p>
        } @else {
          <p class="mb-5 text-sm text-slate-500">
            Ao salvar, você sai de todos os aparelhos e entra com a senha nova.
          </p>

          @if (error()) {
            <p
              class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {{ error() }}
              @if (expired()) {
                <a
                  routerLink="/forgot-password"
                  class="block font-medium underline"
                  >Pedir um link novo</a
                >
              }
            </p>
          }

          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            class="flex flex-col gap-2"
          >
            <mat-form-field appearance="outline">
              <mat-label>Senha nova</mat-label>
              <input
                matInput
                type="password"
                formControlName="password"
                autocomplete="new-password"
              />
              <mat-hint>Pelo menos 8 caracteres</mat-hint>
              @if (form.controls.password.hasError('minlength')) {
                <mat-error>Pelo menos 8 caracteres</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Repita a senha</mat-label>
              <input
                matInput
                type="password"
                formControlName="confirm"
                autocomplete="new-password"
              />
            </mat-form-field>
            @if (form.hasError('mismatch') && form.controls.confirm.touched) {
              <p class="-mt-2 mb-1 text-xs text-red-700">
                As senhas não conferem
              </p>
            }
            @if (loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <button mat-flat-button type="submit" [disabled]="loading()">
              Salvar senha
            </button>
          </form>
        }
      </section>
    </main>
  `,
})
export class ResetPasswordComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly ui = inject(UiService);
  private readonly auth = inject(AuthService);

  /** ?token= do link do e-mail. */
  readonly token = input<string>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expired = signal(false);

  readonly form = inject(NonNullableFormBuilder).group(
    {
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
        ],
      ],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.resetPassword(
        this.token()!,
        this.form.getRawValue().password,
      );
      // as sessões caíram no servidor; a local também precisa sair
      if (this.auth.isAuthenticated()) await this.auth.logout();
      else await this.router.navigate(['/login']);
      this.ui.toast('Senha alterada. Entre com a senha nova.');
    } catch (e) {
      this.expired.set(true);
      this.error.set(apiErrorMessage(e, 'Não foi possível salvar a senha.'));
    } finally {
      this.loading.set(false);
    }
  }
}
