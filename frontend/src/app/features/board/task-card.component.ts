import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Task } from '../../core/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { PRIORITY_CLASSES, PriorityLabelPipe } from '../../shared/labels';

@Component({
  selector: 'app-task-card',
  imports: [
    DatePipe,
    MatIconModule,
    MatTooltipModule,
    PriorityLabelPipe,
    AvatarComponent,
  ],
  template: `
    @let t = task();
    <article
      class="rounded border border-slate-200 bg-white p-2.5 hover:border-slate-400"
    >
      <p class="mb-2 break-words text-[13px] leading-snug text-ink">
        {{ t.title }}
      </p>
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="rounded px-1.5 py-0.5" [class]="priorityClass()">{{
          t.priority | priorityLabel
        }}</span>
        @if (t.dueDate) {
          <span
            class="flex items-center gap-0.5 rounded px-1.5 py-0.5"
            [class]="
              overdue()
                ? 'bg-red-50 text-red-700'
                : 'bg-slate-100 text-slate-600'
            "
            [matTooltip]="overdue() ? 'Atrasada' : 'Prazo'"
          >
            <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">schedule</mat-icon>
            {{ t.dueDate | date: 'dd/MM' }}
          </span>
        }
        @if (t._count.comments > 0) {
          <span class="flex items-center gap-0.5 text-slate-500">
            <mat-icon class="!h-3.5 !w-3.5 !text-[14px]"
              >chat_bubble_outline</mat-icon
            >
            {{ t._count.comments }}
          </span>
        }
        <span class="flex-1"></span>
        <span class="flex -space-x-1">
          @for (a of t.assignees.slice(0, 3); track a.id) {
            <app-avatar
              class="ring-2 ring-white"
              [name]="a.name"
              [url]="a.avatarUrl"
              [seed]="a.id"
              [size]="22"
              [matTooltip]="a.name"
            />
          }
          @if (t.assignees.length > 3) {
            <span
              class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-slate-200 text-[10px] ring-2 ring-white"
            >
              +{{ t.assignees.length - 3 }}
            </span>
          }
        </span>
      </div>
    </article>
  `,
})
export class TaskCardComponent {
  readonly task = input.required<Task>();
  readonly done = input(false);
  readonly priorityClass = computed(
    () => PRIORITY_CLASSES[this.task().priority],
  );
  readonly overdue = computed(() => {
    const due = this.task().dueDate;
    return !this.done() && !!due && new Date(due).getTime() < Date.now();
  });
}
