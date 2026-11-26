import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { ApiService } from '../../core/api.service';
import { Attachment } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { UiService } from '../../shared/dialogs';
import { BoardStore } from './board.store';

const MAX_BYTES = 10 * 1024 * 1024;
const PREVIEWABLE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// só as URLs de blob ocupam memória do navegador
const revoke = (url: string) => {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
};

const iconFor = (mime: string) =>
  mime.startsWith('image/')
    ? 'image'
    : mime === 'application/pdf'
      ? 'picture_as_pdf'
      : mime.startsWith('video/')
        ? 'movie'
        : 'description';

@Component({
  selector: 'app-task-attachments',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="mt-5 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">
        Anexos ({{ attachments().length }})
      </h3>
      @if (!readOnly()) {
        <button
          mat-button
          (click)="input.click()"
          [disabled]="uploading()"
          data-testid="attach-button"
        >
          <mat-icon>attach_file</mat-icon> Anexar
        </button>
        <input
          #input
          type="file"
          multiple
          class="hidden"
          data-testid="attach-input"
          (change)="onFiles(input)"
        />
      }
    </div>
    @if (uploading()) {
      <mat-progress-bar mode="indeterminate" class="my-1" />
    }

    @if (attachments().length) {
      <ul class="mt-2 grid gap-2 sm:grid-cols-2" data-testid="attachments">
        @for (a of attachments(); track a.id) {
          <li
            class="group flex items-center gap-2 rounded border border-slate-200 p-1.5"
            [attr.data-attachment]="a.fileName"
          >
            <button
              class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 text-slate-500"
              (click)="open(a)"
              [attr.aria-label]="'Abrir ' + a.fileName"
            >
              @if (previews()[a.id]; as src) {
                <img [src]="src" alt="" class="h-full w-full object-cover" />
              } @else {
                <mat-icon>{{ icon(a) }}</mat-icon>
              }
            </button>
            <button class="min-w-0 flex-1 text-left" (click)="open(a)">
              <span
                class="block truncate text-[13px] text-ink hover:underline"
                >{{ a.fileName }}</span
              >
              <span class="block truncate text-xs text-slate-400">
                {{ size(a.size) }} · {{ a.uploadedBy.name }} ·
                {{ a.createdAt | date: 'dd/MM' }}
              </span>
            </button>
            @if (canDelete(a)) {
              <button
                mat-icon-button
                class="!h-8 !w-8 !p-1 sm:invisible sm:group-hover:visible"
                (click)="remove(a)"
                [attr.aria-label]="'Excluir ' + a.fileName"
                matTooltip="Excluir"
              >
                <mat-icon class="!text-lg">delete</mat-icon>
              </button>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class TaskAttachmentsComponent implements OnInit {
  readonly taskId = input.required<string>();
  readonly readOnly = input(false);

  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly store = inject(BoardStore);
  private readonly realtime = inject(RealtimeService);

  readonly attachments = signal<Attachment[]>([]);
  readonly previews = signal<Record<string, string>>({});
  readonly uploading = signal(false);
  private readonly me = computed(() => this.store.me());

  readonly size = formatSize;
  readonly icon = (a: Attachment) => iconFor(a.mimeType);

  constructor() {
    // URLs de blob ocupam memória até serem liberadas
    inject(DestroyRef).onDestroy(() =>
      Object.values(this.previews()).forEach(revoke),
    );
    this.realtime
      .on<{ taskId: string; attachment: Attachment }>('attachment.created')
      .pipe(
        filter((e) => e.taskId === this.taskId()),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.add(e.attachment));
    this.realtime
      .on<{ taskId: string; attachmentId: string }>('attachment.deleted')
      .pipe(
        filter((e) => e.taskId === this.taskId()),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.forget(e.attachmentId));
  }

  async ngOnInit() {
    try {
      const list = await this.api.attachments(this.taskId());
      this.attachments.set(list);
      list.forEach((a) => void this.loadPreview(a));
    } catch (e) {
      this.ui.error(e);
    }
  }

  canDelete(a: Attachment) {
    return (
      !this.readOnly() &&
      (a.uploadedBy.id === this.me() || this.store.canManageProject())
    );
  }

  onFiles(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    void this.upload(files);
  }

  // também chamado ao soltar arquivos sobre o painel da tarefa
  async upload(files: File[]) {
    if (this.readOnly() || this.uploading()) return;
    const tooBig = files.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length) {
      this.ui.toast(`${tooBig[0].name} passa de 10 MB.`);
    }
    const ok = files.filter((f) => f.size <= MAX_BYTES);
    if (!ok.length) return;
    this.uploading.set(true);
    try {
      for (const file of ok) {
        const attachment = await this.api.uploadAttachment(this.taskId(), file);
        this.add(attachment);
      }
    } catch (e) {
      this.ui.toast(apiErrorMessage(e, 'Não foi possível anexar o arquivo.'));
    } finally {
      this.uploading.set(false);
    }
  }

  async open(a: Attachment) {
    try {
      const link = document.createElement('a');
      const preview = PREVIEWABLE.includes(a.mimeType);
      if (preview) link.target = '_blank';
      const { url: direct } = await this.api.attachmentLink(a.id);
      if (direct) {
        // o bucket já manda "attachment" para o que não é imagem
        link.href = direct;
      } else {
        const url = URL.createObjectURL(await this.api.attachmentBlob(a.id));
        link.href = url;
        if (!preview) link.download = a.fileName;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      link.click();
    } catch (e) {
      this.ui.error(e);
    }
  }

  async remove(a: Attachment) {
    const ok = await this.ui.confirm({
      title: `Excluir "${a.fileName}"?`,
      message: 'O arquivo é apagado para todos.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteAttachment(a.id);
      this.forget(a.id);
    } catch (e) {
      this.ui.error(e);
    }
  }

  private add(a: Attachment) {
    this.store.attachmentAdded(this.taskId(), a.id);
    if (this.attachments().some((x) => x.id === a.id)) return;
    this.attachments.update((list) => [...list, a]);
    void this.loadPreview(a);
  }

  private forget(id: string) {
    this.store.attachmentRemoved(this.taskId(), id);
    this.attachments.update((list) => list.filter((x) => x.id !== id));
    const url = this.previews()[id];
    if (url) {
      revoke(url);
      this.previews.update(({ [id]: _, ...rest }) => rest);
    }
  }

  private async loadPreview(a: Attachment) {
    if (!PREVIEWABLE.includes(a.mimeType) || this.previews()[a.id]) return;
    try {
      // a miniatura carrega uma vez; o link de 5 min basta
      const { url: direct } = await this.api.attachmentLink(a.id);
      const url =
        direct ?? URL.createObjectURL(await this.api.attachmentBlob(a.id));
      this.previews.update((p) => ({ ...p, [a.id]: url }));
    } catch {
      // sem miniatura: fica o ícone
    }
  }
}
