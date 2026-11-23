import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'taskflow.theme';

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

// o index.html aplica a mesma regra antes do Angular subir (sem piscar)
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(stored());
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    const onSystemChange = () => this.apply();
    this.media.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() =>
      this.media.removeEventListener('change', onSystemChange),
    );
    this.apply();
  }

  set(choice: ThemeChoice) {
    this.choice.set(choice);
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // sem localStorage: vale só nesta aba
    }
    this.apply();
  }

  private apply() {
    const choice = this.choice();
    const dark =
      choice === 'dark' || (choice === 'system' && this.media.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
}
