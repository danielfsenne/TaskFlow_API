import { Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  host: { class: 'inline-flex items-center gap-2' },
  template: `
    <svg
      viewBox="0 0 32 32"
      [attr.width]="size()"
      [attr.height]="size()"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="5" fill="#1f2328" />
      <rect x="7" y="8" width="5" height="16" rx="1" fill="#fff" />
      <rect x="13.5" y="8" width="5" height="11" rx="1" fill="#fff" />
      <rect x="20" y="8" width="5" height="7" rx="1" fill="#fff" />
    </svg>
    @if (withName()) {
      <span class="text-[15px] font-semibold text-ink">TaskFlow</span>
    }
  `,
})
export class LogoComponent {
  readonly size = input(22);
  readonly withName = input(true);
}
