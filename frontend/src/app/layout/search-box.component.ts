import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  from,
  of,
  catchError,
} from 'rxjs';
import { ApiService } from '../core/api.service';
import { SearchResults } from '../core/models';

interface Hit {
  kind: 'task' | 'project' | 'board';
  id: string;
  title: string;
  context: string;
  muted: boolean;
  link: unknown[];
  query?: Record<string, string>;
}

const EMPTY: SearchResults = { tasks: [], projects: [], boards: [] };

@Component({
  selector: 'app-search-box',
  imports: [MatIconModule],
  host: { class: 'relative block w-full max-w-md' },
  template: `
    <label class="relative flex items-center">
      <mat-icon
        class="pointer-events-none absolute left-2 !h-[18px] !w-[18px] !text-[18px] text-slate-400"
        >search</mat-icon
      >
      <input
        #input
        type="search"
        class="h-8 w-full rounded border border-slate-200 bg-slate-50 pl-8 pr-8 text-[13px] placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
        placeholder="Buscar tarefas, projetos, quadros"
        aria-label="Busca geral"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        aria-controls="search-results"
        [value]="term()"
        (input)="onInput(input.value)"
        (focus)="focused.set(true)"
        (keydown)="onKey($event)"
        data-testid="search"
      />
      <kbd
        class="pointer-events-none absolute right-2 hidden rounded border border-slate-200 px-1 text-[10px] text-slate-400"
        [class.sm:block]="!term()"
        >/</kbd
      >
    </label>

    @if (open()) {
      <div
        id="search-results"
        role="listbox"
        class="fixed inset-x-2 top-12 z-50 max-h-[70vh] sm:absolute sm:inset-x-0 sm:top-9 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        data-testid="search-results"
      >
        @if (loading() && !hits().length) {
          <p class="px-3 py-2 text-[13px] text-slate-400">Buscando…</p>
        } @else if (!hits().length) {
          <p class="px-3 py-2 text-[13px] text-slate-500">
            Nada encontrado para "{{ term().trim() }}".
          </p>
        }
        @for (group of groups(); track group.title) {
          <p class="px-3 pb-1 pt-2 text-[11px] font-medium text-slate-400">
            {{ group.title }}
          </p>
          @for (h of group.hits; track h.kind + h.id) {
            <button
              role="option"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left"
              [class.bg-slate-100]="hits()[active()] === h"
              [attr.aria-selected]="hits()[active()] === h"
              (mousedown)="$event.preventDefault()"
              (click)="go(h)"
              (mouseenter)="active.set(hits().indexOf(h))"
              [attr.data-hit]="h.title"
            >
              <mat-icon class="!h-4 !w-4 shrink-0 !text-base text-slate-400">{{
                icon[h.kind]
              }}</mat-icon>
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-[13px]"
                  [class]="h.muted ? 'text-slate-400 line-through' : 'text-ink'"
                  >{{ h.title }}</span
                >
                <span class="block truncate text-xs text-slate-400">{{
                  h.context
                }}</span>
              </span>
            </button>
          }
        }
      </div>
    }
  `,
})
export class SearchBoxComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly input =
    viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly term = signal('');
  readonly focused = signal(false);
  readonly loading = signal(false);
  readonly results = signal<SearchResults>(EMPTY);
  readonly active = signal(0);
  readonly icon = {
    task: 'check_box_outline_blank',
    project: 'folder',
    board: 'view_kanban',
  };

  readonly hits = computed<Hit[]>(() => {
    const r = this.results();
    return [
      ...r.tasks.map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        context: `${t.project.name} / ${t.boardName}`,
        muted: !!t.completedAt,
        link: ['/boards', t.boardId],
        query: { task: t.id },
      })),
      ...r.projects.map((p) => ({
        kind: 'project' as const,
        id: p.id,
        title: p.name,
        context: p.organization.name + (p.archived ? ' · arquivado' : ''),
        muted: false,
        link: ['/projects', p.id],
      })),
      ...r.boards.map((b) => ({
        kind: 'board' as const,
        id: b.id,
        title: b.name,
        context: b.project.name,
        muted: false,
        link: ['/boards', b.id],
      })),
    ];
  });

  readonly groups = computed(() => {
    const all = this.hits();
    return [
      { title: 'Tarefas', hits: all.filter((h) => h.kind === 'task') },
      { title: 'Projetos', hits: all.filter((h) => h.kind === 'project') },
      { title: 'Quadros', hits: all.filter((h) => h.kind === 'board') },
    ].filter((g) => g.hits.length);
  });

  readonly open = computed(
    () => this.focused() && this.term().trim().length >= 2,
  );

  constructor() {
    toObservable(this.term)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const query = q.trim();
          if (query.length < 2) return of(EMPTY);
          this.loading.set(true);
          return from(this.api.search(query)).pipe(catchError(() => of(EMPTY)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        this.results.set(r);
        this.active.set(0);
        this.loading.set(false);
      });
  }

  onInput(value: string) {
    this.term.set(value);
    this.focused.set(true);
  }

  // "/" em qualquer lugar foca a busca (menos quando já se está digitando)
  @HostListener('document:keydown', ['$event'])
  focusShortcut(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const typing =
      target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.input().nativeElement.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(e: MouseEvent) {
    if (!this.host.nativeElement.contains(e.target as Node))
      this.focused.set(false);
  }

  onKey(e: KeyboardEvent) {
    const count = this.hits().length;
    if (e.key === 'Escape') {
      this.focused.set(false);
      this.input().nativeElement.blur();
    } else if (e.key === 'ArrowDown' && count) {
      e.preventDefault();
      this.active.set((this.active() + 1) % count);
    } else if (e.key === 'ArrowUp' && count) {
      e.preventDefault();
      this.active.set((this.active() - 1 + count) % count);
    } else if (e.key === 'Enter' && count) {
      e.preventDefault();
      this.go(this.hits()[this.active()]);
    }
  }

  async go(hit: Hit) {
    this.focused.set(false);
    this.term.set('');
    this.input().nativeElement.blur();
    await this.router.navigate(hit.link, { queryParams: hit.query });
  }
}
