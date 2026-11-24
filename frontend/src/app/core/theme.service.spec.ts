import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let systemDark = false;
  let listener: (() => void) | undefined;
  const isDark = () => document.documentElement.classList.contains('dark');

  beforeEach(() => {
    systemDark = false;
    listener = undefined;
    localStorage.removeItem('taskflow.theme');
    spyOn(window, 'matchMedia').and.callFake(
      () =>
        ({
          get matches() {
            return systemDark;
          },
          addEventListener: (_: string, fn: () => void) => (listener = fn),
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    localStorage.removeItem('taskflow.theme');
    document.documentElement.classList.remove('dark');
  });

  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(ThemeService);
  };

  it('sem escolha salva, segue o sistema e acompanha a mudança', () => {
    const theme = create();
    expect(theme.choice()).toBe('system');
    expect(isDark()).toBeFalse();
    systemDark = true;
    listener!();
    expect(isDark()).toBeTrue();
  });

  it('escolha explícita vence o sistema e fica salva', () => {
    systemDark = true;
    create().set('light');
    expect(isDark()).toBeFalse();
    expect(localStorage.getItem('taskflow.theme')).toBe('light');

    // nova sessão lê a escolha salva
    expect(create().choice()).toBe('light');
  });

  it('voltar para "sistema" apaga a escolha salva', () => {
    const theme = create();
    theme.set('dark');
    expect(isDark()).toBeTrue();
    theme.set('system');
    expect(localStorage.getItem('taskflow.theme')).toBeNull();
    expect(isDark()).toBeFalse();
  });

  it('valor estranho no localStorage vira "sistema"', () => {
    localStorage.setItem('taskflow.theme', 'roxo');
    expect(create().choice()).toBe('system');
  });
});
