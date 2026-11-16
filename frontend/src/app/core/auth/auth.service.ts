import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthResponse, TokenPair, User } from '../models';

const REFRESH_KEY = 'taskflow.refreshToken';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (modo privado): a sessão vale só nesta aba.
  }
}

/**
 * Sessão do usuário. O access token fica só em memória; o refresh token
 * fica no localStorage para a sessão sobreviver a recarregar a página.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  private refreshing: Promise<string | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** Restaura a sessão ao abrir o app, se houver refresh token salvo. */
  async restore(): Promise<void> {
    if (!readStorage(REFRESH_KEY)) return;
    const token = await this.refresh();
    if (!token) return;
    try {
      this._user.set(
        await firstValueFrom(this.http.get<User>('/api/v1/users/me')),
      );
    } catch {
      this.clear();
    }
  }

  async login(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/v1/auth/login', { email, password }),
    );
    this.start(res);
  }

  async register(name: string, email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<AuthResponse>('/api/v1/auth/register', {
        name,
        email,
        password,
      }),
    );
    this.start(res);
  }

  async logout() {
    const refreshToken = readStorage(REFRESH_KEY);
    this.clear();
    await this.router.navigate(['/login']);
    if (refreshToken) {
      // Revoga no servidor; se falhar, o token expira sozinho.
      this.http
        .post('/api/v1/auth/logout', { refreshToken })
        .subscribe({ error: () => undefined });
    }
  }

  /**
   * Troca o refresh token por um novo par. Chamadas simultâneas compartilham
   * a mesma requisição, porque o backend rotaciona (e invalida) o token usado.
   */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Sessão expirou de vez: limpa e manda para o login. */
  async expire() {
    this.clear();
    await this.router.navigate(['/login'], {
      queryParams: { expired: 1 },
    });
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = readStorage(REFRESH_KEY);
    if (!refreshToken) return null;
    try {
      const pair = await firstValueFrom(
        this.http.post<TokenPair>('/api/v1/auth/refresh', { refreshToken }),
      );
      this.setTokens(pair);
      return pair.accessToken;
    } catch {
      this.clear();
      return null;
    }
  }

  private start(res: AuthResponse) {
    this.setTokens(res);
    this._user.set(res.user);
  }

  private setTokens({ accessToken, refreshToken }: TokenPair) {
    this._accessToken.set(accessToken);
    writeStorage(REFRESH_KEY, refreshToken);
  }

  private clear() {
    this._accessToken.set(null);
    this._user.set(null);
    writeStorage(REFRESH_KEY, null);
  }
}
