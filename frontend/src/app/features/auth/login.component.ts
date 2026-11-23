import { Component, inject, input, signal } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-login',
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
        <h1 class="mb-1 text-lg font-semibold text-ink">Entrar no TaskFlow</h1>
        <p class="mb-6 text-sm text-slate-500">Use seu e-mail e senha.</p>

        @if (expired()) {
          <p class="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Sua sessão expirou. Entre novamente.
          </p>
        }
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

          <mat-form-field appearance="outline">
            <mat-label>Senha</mat-label>
            <input
              matInput
              type="password"
              formControlName="password"
              autocomplete="current-password"
            />
          </mat-form-field>
          <a
            routerLink="/forgot-password"
            class="-mt-3 mb-2 self-end text-xs text-brand-700 hover:underline"
            >Esqueci minha senha</a
          >

          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <button mat-flat-button type="submit" [disabled]="loading()">
            Entrar
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
          Ainda não tem conta?
          <a
            routerLink="/register"
            [queryParams]="{ returnUrl: returnUrl() }"
            class="font-medium text-brand-700 hover:underline"
            >Cadastre-se</a
          >
        </p>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim().toLowerCase(), password);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Não foi possível entrar.'));
    } finally {
      this.loading.set(false);
    }
  }
}

// só caminhos internos (evita redirecionamento aberto)
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}
