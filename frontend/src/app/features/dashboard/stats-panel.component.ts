import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardStats } from '../../core/models';
import {
  BarListComponent,
  BarRow,
  StatTileComponent,
  WeeklyChartComponent,
} from '../../shared/charts';
import { PRIORITY_LABELS } from '../../shared/labels';

@Component({
  selector: 'app-stats-panel',
  imports: [
    RouterLink,
    BarListComponent,
    StatTileComponent,
    WeeklyChartComponent,
  ],
  template: `
    @let s = stats();
    @if (s.totals.total === 0) {
      <p class="card px-4 py-10 text-center text-sm text-slate-500">
        Sem tarefas ainda. Uma tarefa conta como concluída quando está na última
        coluna do quadro.
      </p>
    } @else {
      <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <app-stat-tile
          label="Abertas"
          [value]="s.totals.open"
          [hint]="s.totals.unassigned + ' sem responsável'"
        />
        <app-stat-tile
          label="Concluídas"
          [value]="s.totals.completed"
          [hint]="completionRate() + '% do total'"
        />
        <app-stat-tile
          label="Atrasadas"
          [value]="s.totals.overdue"
          icon="error_outline"
          [tone]="s.totals.overdue ? 'critical' : 'neutral'"
        />
        <app-stat-tile
          label="Vencem em 7 dias"
          [value]="s.totals.dueSoon"
          icon="schedule"
          [tone]="s.totals.dueSoon ? 'warning' : 'neutral'"
        />
      </div>

      <div class="mt-3 grid gap-3 lg:grid-cols-5">
        <section class="card p-4 lg:col-span-3">
          <h3 class="text-sm font-semibold text-ink">Criadas e concluídas</h3>
          <p class="mb-3 text-xs text-slate-500">Últimas 8 semanas</p>
          <app-weekly-chart [weeks]="s.weekly" />
        </section>

        <section class="card p-4 lg:col-span-2">
          <h3 class="text-sm font-semibold text-ink">Abertas por prioridade</h3>
          <p class="mb-4 text-xs text-slate-500">&nbsp;</p>
          <app-bar-list [rows]="priorityRows()" empty="Nada aberto." />
        </section>
      </div>

      <div class="mt-3 grid gap-3 lg:grid-cols-2">
        <section class="card overflow-hidden">
          <h3 class="px-4 pt-4 text-sm font-semibold text-ink">
            {{ breakdownTitle() }}
          </h3>
          <table class="mt-2 w-full text-[13px]">
            <thead>
              <tr class="text-left text-xs text-slate-400">
                <th class="px-4 py-1.5 font-normal">Nome</th>
                <th class="w-32 px-2 py-1.5 font-normal">Concluídas</th>
                <th class="px-4 py-1.5 text-right font-normal">Atrasadas</th>
              </tr>
            </thead>
            <tbody>
              @for (b of s.breakdown; track b.id) {
                <tr class="border-t border-slate-100">
                  <td class="max-w-0 truncate px-4 py-2">
                    <a
                      [routerLink]="[linkBase(), b.id]"
                      class="text-ink hover:text-brand-700 hover:underline"
                      [attr.data-breakdown]="b.name"
                      >{{ b.name }}</a
                    >
                  </td>
                  <td class="px-2 py-2">
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 flex-1 rounded-full bg-slate-100">
                        <div
                          class="h-full rounded-full bg-series-completed"
                          [style.width.%]="
                            b.total ? (b.completed / b.total) * 100 : 0
                          "
                        ></div>
                      </div>
                      <span class="w-10 text-right tabular-nums text-slate-500"
                        >{{ b.completed }}/{{ b.total }}</span
                      >
                    </div>
                  </td>
                  <td
                    class="px-4 py-2 text-right tabular-nums"
                    [class]="b.overdue ? 'text-critical' : 'text-slate-400'"
                  >
                    {{ b.overdue }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3" class="px-4 py-4 text-center text-slate-400">
                    Nada por aqui.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="card p-4">
          <h3 class="text-sm font-semibold text-ink">Carga por pessoa</h3>
          <p class="mb-3 text-xs text-slate-500">Tarefas abertas atribuídas</p>
          <app-bar-list
            [rows]="memberRows()"
            valueLabel="No prazo"
            criticalLabel="Atrasadas"
            empty="Ninguém na organização ainda."
          />
        </section>
      </div>
    }
  `,
})
export class StatsPanelComponent {
  readonly stats = input.required<DashboardStats>();
  readonly breakdownKind = input<'projects' | 'boards'>('projects');

  readonly breakdownTitle = computed(() =>
    this.breakdownKind() === 'projects' ? 'Projetos' : 'Quadros',
  );
  readonly linkBase = computed(() =>
    this.breakdownKind() === 'projects' ? '/projects' : '/boards',
  );
  readonly completionRate = computed(() => {
    const { total, completed } = this.stats().totals;
    return total ? Math.round((completed / total) * 100) : 0;
  });
  readonly priorityRows = computed<BarRow[]>(() =>
    this.stats().byPriority.map((p) => ({
      key: p.priority,
      label: PRIORITY_LABELS[p.priority],
      value: p.open,
    })),
  );
  readonly memberRows = computed<BarRow[]>(() =>
    this.stats().byMember.map((m) => ({
      key: m.user.id,
      label: m.user.name,
      value: m.open,
      critical: m.overdue,
      hint: `${m.completed} concluídas`,
    })),
  );
}
