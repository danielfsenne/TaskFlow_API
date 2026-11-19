import { Component, inject, signal } from '@angular/core';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models';
import { WorkspaceService } from '../../core/workspace.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { UiService } from '../../shared/dialogs';
import { passwordsMatch } from '../auth/reset-password.component';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-profile',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    AvatarComponent,
  ],
  template: `
    <div class="page max-w-2xl">
      <h1 class="mb-5 text-xl font-semibold text-ink">Meu perfil</h1>

      <section class="card mb-4 p-5">
        <h2 class="mb-4 text-sm font-semibold text-ink">Foto e nome</h2>
        <div class="flex items-center gap-4">
          <app-avatar
            [name]="auth.user()?.name"
            [url]="auth.user()?.avatarUrl"
            [seed]="auth.user()?.id"
            [size]="64"
            data-testid="profile-avatar"
          />
          <div class="flex flex-wrap gap-2">
            <button
              mat-stroked-button
              type="button"
              (click)="fileInput.click()"
              [disabled]="uploading()"
            >
              {{ auth.user()?.avatarUrl ? 'Trocar foto' : 'Enviar foto' }}
            </button>
            @if (auth.user()?.avatarUrl) {
              <button
                mat-button
                type="button"
                (click)="removeAvatar()"
                [disabled]="uploading()"
              >
                Remover
              </button>
            }
            <input
              #fileInput
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              data-testid="avatar-input"
              (change)="onFile(fileInput)"
            />
          </div>
        </div>
        <p class="mt-2 text-xs text-slate-400">PNG, JPEG ou WebP, até 2 MB.</p>

        <form
          [formGroup]="profile"
          (ngSubmit)="saveName()"
          class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start"
        >
          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>Nome</mat-label>
            <input matInput formControlName="name" autocomplete="name" />
            @if (profile.controls.name.hasError('minlength')) {
              <mat-error>Pelo menos 2 caracteres</mat-error>
            }
          </mat-form-field>
          <button
            mat-flat-button
            type="submit"
            class="sm:mt-2"
            [disabled]="profile.pristine || savingName()"
          >
            Salvar nome
          </button>
        </form>
        <p class="text-xs text-slate-400">E-mail: {{ auth.user()?.email }}</p>
      </section>

      <section class="card p-5">
        <h2 class="text-sm font-semibold text-ink">Senha</h2>
        <p class="mb-4 text-xs text-slate-500">
          Ao trocar, as sessões abertas em outros aparelhos são encerradas.
        </p>
        <form
          [formGroup]="password"
          #passwordForm="ngForm"
          (ngSubmit)="changePassword(passwordForm)"
          class="flex flex-col gap-1"
        >
          <mat-form-field appearance="outline">
            <mat-label>Senha atual</mat-label>
            <input
              matInput
              type="password"
              formControlName="current"
              autocomplete="current-password"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Senha nova</mat-label>
            <input
              matInput
              type="password"
              formControlName="password"
              autocomplete="new-password"
            />
            @if (password.controls.password.hasError('minlength')) {
              <mat-error>Pelo menos 8 caracteres</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Repita a senha nova</mat-label>
            <input
              matInput
              type="password"
              formControlName="confirm"
              autocomplete="new-password"
            />
          </mat-form-field>
          @if (
            password.hasError('mismatch') && password.controls.confirm.touched
          ) {
            <p class="-mt-1 mb-2 text-xs text-red-700">
              As senhas não conferem
            </p>
          }
          <div>
            <button mat-flat-button type="submit" [disabled]="savingPassword()">
              Trocar senha
            </button>
          </div>
        </form>
      </section>
    </div>
  `,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly uploading = signal(false);
  readonly savingName = signal(false);
  readonly savingPassword = signal(false);

  readonly profile = this.fb.group({
    name: [
      this.auth.user()?.name ?? '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    ],
  });

  readonly password = this.fb.group(
    {
      current: ['', Validators.required],
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

  constructor() {
    inject(WorkspaceService).activeOrgId.set(null);
  }

  async onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      this.ui.toast('Escolha uma imagem PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.ui.toast('A imagem precisa ter no máximo 2 MB.');
      return;
    }
    await this.withUpload(() => this.api.uploadAvatar(file), 'Foto atualizada');
  }

  removeAvatar() {
    return this.withUpload(() => this.api.removeAvatar(), 'Foto removida');
  }

  async saveName() {
    if (this.profile.invalid) {
      this.profile.markAllAsTouched();
      return;
    }
    this.savingName.set(true);
    try {
      const user = await this.api.updateProfile(
        this.profile.getRawValue().name.trim(),
      );
      this.auth.updateUser(user);
      this.profile.reset({ name: user.name });
      this.ui.toast('Nome atualizado');
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.savingName.set(false);
    }
  }

  async changePassword(form: FormGroupDirective) {
    if (this.password.invalid) {
      this.password.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    try {
      const { current, password } = this.password.getRawValue();
      this.auth.replaceTokens(await this.api.changePassword(current, password));
      form.resetForm({ current: '', password: '', confirm: '' });
      this.ui.toast('Senha alterada');
    } catch (e) {
      this.ui.toast(apiErrorMessage(e, 'Não foi possível trocar a senha.'));
    } finally {
      this.savingPassword.set(false);
    }
  }

  private async withUpload(action: () => Promise<User>, done: string) {
    this.uploading.set(true);
    try {
      this.auth.updateUser(await action());
      this.ui.toast(done);
    } catch (e) {
      this.ui.toast(apiErrorMessage(e, 'Não foi possível atualizar a foto.'));
    } finally {
      this.uploading.set(false);
    }
  }
}
