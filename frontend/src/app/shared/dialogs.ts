import { Component, inject, Injectable } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../core/api-error';

export interface FormDialogData {
  title: string;
  submitLabel?: string;
  nameLabel?: string;
  name?: string;
  minLength?: number;
  maxLength?: number;
  /** Mostra também um campo de descrição (opcional). */
  withDescription?: boolean;
  description?: string;
}

export interface FormDialogResult {
  name: string;
  description: string;
}

@Component({
  selector: 'app-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <mat-dialog-content class="!flex flex-col gap-1 sm:min-w-96">
        <mat-form-field appearance="outline">
          <mat-label>{{ data.nameLabel ?? 'Nome' }}</mat-label>
          <input matInput formControlName="name" cdkFocusInitial />
          @if (form.controls.name.hasError('minlength')) {
            <mat-error>Mínimo de {{ data.minLength ?? 2 }} caracteres</mat-error>
          }
        </mat-form-field>
        @if (data.withDescription) {
          <mat-form-field appearance="outline">
            <mat-label>Descrição (opcional)</mat-label>
            <textarea matInput formControlName="description" rows="3"></textarea>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit">{{ data.submitLabel ?? 'Salvar' }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class FormDialogComponent {
  readonly data = inject<FormDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FormDialogComponent, FormDialogResult>);

  readonly form = inject(NonNullableFormBuilder).group({
    name: [
      this.data.name ?? '',
      [
        Validators.required,
        Validators.minLength(this.data.minLength ?? 2),
        Validators.maxLength(this.data.maxLength ?? 100),
      ],
    ],
    description: [this.data.description ?? '', Validators.maxLength(2000)],
  });

  submit() {
    const name = this.form.controls.name.value.trim();
    this.form.controls.name.setValue(name);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close({ name, description: this.form.controls.description.value.trim() });
  }
}

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="max-w-md">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button
        mat-flat-button
        [mat-dialog-close]="true"
        [class.!bg-red-600]="data.danger"
        cdkFocusInitial
      >
        {{ data.confirmLabel ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Atalhos para diálogos e avisos usados em várias telas. */
@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  form(data: FormDialogData): Promise<FormDialogResult | undefined> {
    return firstValueFrom(
      this.dialog.open(FormDialogComponent, { data, autoFocus: 'dialog' }).afterClosed(),
    );
  }

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, { data }).afterClosed(),
    );
    return ok === true;
  }

  toast(message: string) {
    this.snack.open(message, 'OK', { duration: 3000 });
  }

  error(error: unknown, fallback?: string) {
    this.snack.open(apiErrorMessage(error, fallback), 'OK', { duration: 5000 });
  }
}
