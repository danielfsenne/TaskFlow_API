import {
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
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
import { safeReturnUrl } from './login.component';

@Component({
  selector: 'app-register',
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
        <h1 class="mb-1 text-lg font-semibold text-ink">Criar conta</h1>
        <p class="mb-6 text-sm text-slate-500">Leva menos de um minuto.</p>

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
            <mat-label>Nome</mat-label>
            <input matInput formControlName="name" autocomplete="name" />
            @if (form.controls.name.hasError('minlength')) {
              <mat-error>Mínimo de 2 caracteres</mat-error>
            }
          </mat-form-field>

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
              autocomplete="new-password"
            />
            <mat-hint>Mínimo de 8 caracteres</mat-hint>
            @if (form.controls.password.hasError('minlength')) {
              <mat-error>Mínimo de 8 caracteres</mat-error>
            }
          </mat-form-field>

          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <button
            mat-flat-button
            type="submit"
            class="mt-2"
            [disabled]="loading()"
          >
            Criar conta
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
          Já tem conta?
          <a
            routerLink="/login"
            [queryParams]="{ returnUrl: returnUrl() }"
            class="font-medium text-brand-700 hover:underline"
            >Entrar</a
          >
        </p>
      </section>
    </main>
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params: vindo de um convite, o e-mail já vem preenchido. */
  readonly returnUrl = input<string>();
  readonly email = input<string>();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    ],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    ],
  });

  constructor() {
    effect(() => {
      const email = this.email();
      if (email) untracked(() => this.form.controls.email.setValue(email));
    });
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const { name, email, password } = this.form.getRawValue();
      await this.auth.register(
        name.trim(),
        email.trim().toLowerCase(),
        password,
      );
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Não foi possível criar a conta.'));
    } finally {
      this.loading.set(false);
    }
  }
}
