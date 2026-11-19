import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

// `autofocus` do HTML só vale no primeiro carregamento da página; campos que
// aparecem depois (via @if) precisam do foco dado na mão.
@Directive({ selector: '[appFocusOnRender]' })
export class FocusOnRenderDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => el.focus());
  }
}
