import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export function niceMax(value: number): number {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 5, 10]) if (value <= m * pow) return m * pow;
  return 10 * pow;
}

export type Tone = 'neutral' | 'brand' | 'critical' | 'warning' | 'good';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  brand: 'text-ink',
  critical: 'text-critical',
  warning: 'text-amber-700',
  good: 'text-ink',
};

@Component({
  selector: 'app-stat-tile',
  imports: [MatIconModule],
  host: { class: 'card block px-4 py-3' },
  template: `
    <p class="flex items-center gap-1 text-[13px] text-slate-500">
      @if (alert()) {
        <mat-icon class="!h-4 !w-4 !text-base" [class]="valueClass()">{{
          icon()
        }}</mat-icon>
      }
      {{ label() }}
    </p>
    <p
      class="mt-1 text-2xl font-semibold tabular-nums"
      [class]="valueClass()"
      [attr.data-stat]="label()"
    >
      {{ value() }}
    </p>
    @if (hint()) {
      <p class="mt-0.5 text-xs text-slate-400">{{ hint() }}</p>
    }
  `,
})
export class StatTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly icon = input('error_outline');
  readonly tone = input<Tone>('neutral');
  readonly hint = input<string>();
  readonly valueClass = computed(() => TONE_TEXT[this.tone()]);
  readonly alert = computed(
    () => this.tone() === 'critical' || this.tone() === 'warning',
  );
}

export interface WeekPoint {
  weekStart: string;
  created: number;
  completed: number;
}

@Component({
  selector: 'app-weekly-chart',
  imports: [DatePipe, MatTooltipModule],
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex items-center gap-4 text-xs text-slate-600">
        <span class="flex items-center gap-1.5"
          ><span class="h-2.5 w-2.5 rounded-sm bg-series-created"></span
          >Criadas</span
        >
        <span class="flex items-center gap-1.5"
          ><span class="h-2.5 w-2.5 rounded-sm bg-series-completed"></span
          >Concluídas</span
        >
      </div>
      <span class="flex-1"></span>
      <button
        class="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        (click)="asTable.set(!asTable())"
      >
        {{ asTable() ? 'Ver gráfico' : 'Ver tabela' }}
      </button>
    </div>

    @if (asTable()) {
      <table class="w-full text-sm tabular-nums">
        <thead>
          <tr class="text-left text-xs text-slate-500">
            <th class="py-1.5 font-medium">Semana</th>
            <th class="py-1.5 text-right font-medium">Criadas</th>
            <th class="py-1.5 text-right font-medium">Concluídas</th>
          </tr>
        </thead>
        <tbody>
          @for (w of weeks(); track w.weekStart) {
            <tr class="border-t border-slate-100">
              <td class="py-1.5">{{ w.weekStart | date: 'dd/MM' : 'UTC' }}</td>
              <td class="py-1.5 text-right">{{ w.created }}</td>
              <td class="py-1.5 text-right">{{ w.completed }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <div class="flex gap-2 pt-3">
        <div
          class="relative h-44 w-6 shrink-0 text-right text-[11px] tabular-nums text-slate-400"
        >
          @for (t of ticks(); track t) {
            <span
              class="absolute right-0 -translate-y-1/2"
              [style.bottom.%]="(t / max()) * 100"
              >{{ t }}</span
            >
          }
        </div>
        <div class="min-w-0 flex-1">
          <div class="relative h-44">
            @for (t of ticks(); track t) {
              <div
                class="absolute inset-x-0 border-t"
                [class]="t === 0 ? 'border-slate-300' : 'border-slate-100'"
                [style.bottom.%]="(t / max()) * 100"
              ></div>
            }
            <div class="absolute inset-0 flex">
              @for (w of weeks(); track w.weekStart; let last = $last) {
                <div
                  class="group relative flex flex-1 items-end justify-center gap-0.5 rounded-md hover:bg-slate-100/70"
                  [matTooltip]="tooltip(w)"
                  matTooltipPosition="above"
                  [attr.data-week]="w.weekStart"
                >
                  <div
                    class="relative w-full max-w-[18px] rounded-t bg-series-created"
                    [style.height.%]="(w.created / max()) * 100"
                  >
                    @if (last && w.created > 0) {
                      <span
                        class="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-700"
                        >{{ w.created }}</span
                      >
                    }
                  </div>
                  <div
                    class="relative w-full max-w-[18px] rounded-t bg-series-completed"
                    [style.height.%]="(w.completed / max()) * 100"
                  >
                    @if (last && w.completed > 0) {
                      <span
                        class="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-700"
                        >{{ w.completed }}</span
                      >
                    }
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="mt-2 flex text-[11px] text-slate-400">
            @for (w of weeks(); track w.weekStart; let last = $last) {
              <span class="flex-1 text-center" [class.font-medium]="last">{{
                last ? 'Esta' : (w.weekStart | date: 'dd/MM' : 'UTC')
              }}</span>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class WeeklyChartComponent {
  readonly weeks = input.required<WeekPoint[]>();
  readonly asTable = signal(false);
  readonly max = computed(() =>
    niceMax(
      Math.max(0, ...this.weeks().flatMap((w) => [w.created, w.completed])),
    ),
  );
  readonly ticks = computed(() => [0, this.max() / 2, this.max()]);

  tooltip(w: WeekPoint) {
    const d = new Date(w.weekStart);
    const label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return `Semana de ${label}: ${w.created} criadas · ${w.completed} concluídas`;
  }
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  critical?: number;
  hint?: string;
}

@Component({
  selector: 'app-bar-list',
  imports: [MatTooltipModule],
  template: `
    @if (criticalLabel()) {
      <div class="mb-3 flex items-center gap-4 text-xs text-slate-600">
        <span class="flex items-center gap-1.5"
          ><span class="h-2.5 w-2.5 rounded-sm bg-series-created"></span
          >{{ valueLabel() }}</span
        >
        <span class="flex items-center gap-1.5"
          ><span class="h-2.5 w-2.5 rounded-sm bg-critical"></span
          >{{ criticalLabel() }}</span
        >
      </div>
    }
    <ul class="flex flex-col gap-3">
      @for (r of rows(); track r.key) {
        <li
          class="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm"
          [matTooltip]="tooltip(r)"
          [attr.data-bar]="r.label"
        >
          <span class="truncate text-slate-600">{{ r.label }}</span>
          <div class="flex items-center gap-2">
            <div class="flex h-2.5 min-w-0 flex-1 gap-0.5">
              @if (r.critical) {
                <div
                  class="h-full rounded-l bg-critical"
                  [class.rounded-r]="r.critical === r.value"
                  [style.width.%]="(r.critical / max()) * 100"
                ></div>
              }
              @if (r.value - (r.critical ?? 0) > 0) {
                <div
                  class="h-full rounded-r bg-series-created"
                  [class.rounded-l]="!r.critical"
                  [style.width.%]="
                    ((r.value - (r.critical ?? 0)) / max()) * 100
                  "
                ></div>
              }
            </div>
            <span
              class="w-6 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700"
              >{{ r.value }}</span
            >
          </div>
        </li>
      } @empty {
        <li class="py-4 text-center text-sm text-slate-400">{{ empty() }}</li>
      }
    </ul>
  `,
})
export class BarListComponent {
  readonly rows = input.required<BarRow[]>();
  readonly valueLabel = input('Abertas');
  readonly criticalLabel = input<string>();
  readonly empty = input('Sem dados ainda.');
  readonly max = computed(() =>
    Math.max(1, ...this.rows().map((r) => r.value)),
  );

  tooltip(r: BarRow) {
    const base = this.criticalLabel() ? r.value - (r.critical ?? 0) : r.value;
    const parts = [`${r.label}: ${base} ${this.valueLabel().toLowerCase()}`];
    if (this.criticalLabel()) {
      parts.push(`${r.critical ?? 0} ${this.criticalLabel()!.toLowerCase()}`);
    }
    if (r.hint) parts.push(r.hint);
    return parts.join(' · ');
  }
}
