import { Component, computed, effect, input, signal } from '@angular/core';
import { InitialsPipe } from './labels';

const TONES = [
  'bg-indigo-100 text-indigo-800',
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-900',
];

export function toneFor(key: string | undefined | null) {
  let h = 0;
  for (const ch of key ?? '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

@Component({
  selector: 'app-avatar',
  imports: [InitialsPipe],
  host: {
    class:
      'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold',
    '[class]': 'showImage() ? "bg-slate-100" : tone()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.4',
    '[attr.title]': 'name()',
  },
  template: `
    @if (showImage()) {
      <img
        [src]="url()"
        alt=""
        class="h-full w-full object-cover"
        (error)="failed.set(true)"
      />
    } @else {
      {{ name() | initials }}
    }
  `,
})
export class AvatarComponent {
  readonly name = input<string | null | undefined>('');
  readonly url = input<string | null | undefined>(null);
  readonly seed = input<string | null | undefined>(undefined);
  readonly size = input(32);
  readonly tone = computed(() => toneFor(this.seed() ?? this.name()));
  readonly failed = signal(false);
  readonly showImage = computed(() => !!this.url() && !this.failed());

  constructor() {
    // outra URL: tenta carregar de novo
    effect(() => {
      this.url();
      this.failed.set(false);
    });
  }
}
