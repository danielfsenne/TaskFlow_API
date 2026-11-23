import { Component, computed, input } from '@angular/core';
import { Label, LabelColor } from '../core/models';

// fundo claro com texto escuro do mesmo tom: legível em qualquer cor
export const LABEL_COLORS: Record<
  LabelColor,
  { name: string; chip: string; dot: string }
> = {
  gray: {
    name: 'Cinza',
    chip: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
  },
  red: { name: 'Vermelho', chip: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  orange: {
    name: 'Laranja',
    chip: 'bg-orange-100 text-orange-800',
    dot: 'bg-orange-500',
  },
  yellow: {
    name: 'Amarelo',
    chip: 'bg-yellow-100 text-yellow-900',
    dot: 'bg-yellow-400',
  },
  green: {
    name: 'Verde',
    chip: 'bg-green-100 text-green-800',
    dot: 'bg-green-500',
  },
  teal: {
    name: 'Verde-água',
    chip: 'bg-teal-100 text-teal-800',
    dot: 'bg-teal-500',
  },
  blue: { name: 'Azul', chip: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  purple: {
    name: 'Roxo',
    chip: 'bg-purple-100 text-purple-800',
    dot: 'bg-purple-500',
  },
  pink: { name: 'Rosa', chip: 'bg-pink-100 text-pink-800', dot: 'bg-pink-500' },
};

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

@Component({
  selector: 'app-label-chip',
  host: {
    class:
      'inline-flex max-w-full items-center rounded px-1.5 py-px text-[11px] font-medium',
    '[class]': 'classes()',
    '[attr.data-label]': 'label().name',
  },
  template: `<span class="truncate">{{ label().name }}</span>`,
})
export class LabelChipComponent {
  readonly label = input.required<Label>();
  readonly classes = computed(
    () => LABEL_COLORS[this.label().color]?.chip ?? LABEL_COLORS.gray.chip,
  );
}
