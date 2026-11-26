import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Label, LabelColor } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import {
  LABEL_COLOR_KEYS,
  LABEL_COLORS,
  LabelChipComponent,
} from '../../shared/label-chip.component';
import { BoardStore } from './board.store';

@Component({
  selector: 'app-labels-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatTooltipModule,
    LabelChipComponent,
  ],
  template: `
    <h2 mat-dialog-title>Etiquetas do projeto</h2>
    <p class="-mt-2 px-6 text-xs text-slate-500">
      Valem para todos os quadros deste projeto.
    </p>
    <mat-dialog-content class="sm:min-w-[26rem]">
      <ul class="mb-4 flex flex-col gap-1" data-testid="labels-list">
        @for (l of store.labels(); track l.id) {
          <li
            class="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50"
          >
            @if (editing() === l.id) {
              <input
                class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                [(ngModel)]="editName"
                maxlength="30"
                aria-label="Nome da etiqueta"
                (keydown.enter)="saveName(l)"
                (keydown.escape)="editing.set(null)"
              />
              <button mat-button (click)="saveName(l)">Salvar</button>
            } @else {
              <app-label-chip [label]="l" class="!max-w-[12rem]" />
              <span class="flex-1"></span>
              <div class="flex gap-0.5">
                @for (c of colors; track c) {
                  <button
                    class="h-4 w-4 rounded-full ring-offset-1"
                    [class]="LABEL_COLORS[c].dot"
                    [class.ring-2]="l.color === c"
                    [class.ring-slate-500]="l.color === c"
                    [matTooltip]="LABEL_COLORS[c].name"
                    [attr.aria-label]="'Cor ' + LABEL_COLORS[c].name"
                    (click)="store.updateLabel(l.id, { color: c })"
                  ></button>
                }
              </div>
              <button
                mat-icon-button
                class="!h-8 !w-8 !p-1"
                (click)="startEdit(l)"
                [attr.aria-label]="'Renomear ' + l.name"
              >
                <mat-icon class="!text-lg">edit</mat-icon>
              </button>
              <button
                mat-icon-button
                class="!h-8 !w-8 !p-1"
                (click)="remove(l)"
                [attr.aria-label]="'Excluir ' + l.name"
              >
                <mat-icon class="!text-lg">delete</mat-icon>
              </button>
            }
          </li>
        } @empty {
          <li class="py-2 text-sm text-slate-500">Nenhuma etiqueta ainda.</li>
        }
      </ul>

      <form
        class="flex flex-col gap-2 border-t border-slate-100 pt-4"
        (ngSubmit)="create()"
      >
        <span class="text-xs font-medium text-slate-600">Nova etiqueta</span>
        <div class="flex gap-2">
          <input
            class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            name="name"
            [(ngModel)]="newName"
            maxlength="30"
            placeholder="Nome (ex.: bug)"
            aria-label="Nome da nova etiqueta"
          />
          <button mat-flat-button type="submit" [disabled]="!newName.trim()">
            Criar
          </button>
        </div>
        <div class="flex gap-1.5" role="radiogroup" aria-label="Cor">
          @for (c of colors; track c) {
            <button
              type="button"
              class="h-5 w-5 rounded-full ring-offset-2"
              [class]="LABEL_COLORS[c].dot"
              [class.ring-2]="newColor() === c"
              [class.ring-slate-600]="newColor() === c"
              [matTooltip]="LABEL_COLORS[c].name"
              role="radio"
              [attr.aria-checked]="newColor() === c"
              [attr.aria-label]="LABEL_COLORS[c].name"
              (click)="newColor.set(c)"
            ></button>
          }
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
})
export class LabelsDialogComponent {
  readonly store = inject(BoardStore);
  private readonly ui = inject(UiService);
  readonly LABEL_COLORS = LABEL_COLORS;
  readonly colors = LABEL_COLOR_KEYS;

  readonly editing = signal<string | null>(null);
  editName = '';
  newName = '';
  readonly newColor = signal<LabelColor>('blue');

  async create() {
    const name = this.newName.trim();
    if (!name) return;
    if (await this.store.createLabel(name, this.newColor())) this.newName = '';
  }

  startEdit(label: Label) {
    this.editName = label.name;
    this.editing.set(label.id);
  }

  async saveName(label: Label) {
    const name = this.editName.trim();
    if (name && name !== label.name) {
      await this.store.updateLabel(label.id, { name });
    }
    this.editing.set(null);
  }

  async remove(label: Label) {
    const ok = await this.ui.confirm({
      title: `Excluir "${label.name}"?`,
      message: 'A etiqueta sai de todas as tarefas do projeto.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) await this.store.deleteLabel(label.id);
  }
}
