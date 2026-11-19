import { Component, inject, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-forgot-password',
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
        @if (sentTo()) {
          <h1 class="mb-1 text-lg font-semibold text-ink">
            Confira seu e-mail
          </h1>
          <p class="text-sm text-slate-600" data-testid="forgot-sent">
            Se existir uma conta com <strong>{{ sentTo() }}</strong
            >, enviamos um link para criar uma senha nova. Ele vale por 1 hora.
          </p>
        } @else {
          <h1 class="mb-1 text-lg font-semibold text-ink">
            Esqueci minha senha
          </h1>
          <p class="mb-5 text-sm text-slate-500">
            Informe o e-mail da conta para receber um link de redefinição.
          </p>

          @if (error()) {
            <p
              class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {{ error() }}
            </p>
          }

          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            class="flex flex-col gap-2"
          >
            <mat-form-field appearance="outline">
              <mat-label>E-mail</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="email"
              />
              @if (form.controls.email.hasError('email')) {
                <mat-error>E-mail inválido</mat-error>
              }
            </mat-form-field>
            @if (loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <button mat-flat-button type="submit" [disabled]="loading()">
              Enviar link
            </button>
          </form>
        }

        <p class="mt-6 text-center text-sm text-slate-500">
          <a routerLink="/login" class="text-brand-700 hover:underline"
            >Voltar para o login</a
          >
        </p>
      </section>
    </main>
  `,
})
export class ForgotPasswordComponent {
  private readonly api = inject(ApiService);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentTo = signal<string | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const email = this.form.getRawValue().email.trim().toLowerCase();
      await this.api.forgotPassword(email);
      this.sentTo.set(email);
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Não foi possível enviar o link.'));
    } finally {
      this.loading.set(false);
    }
  }
}
