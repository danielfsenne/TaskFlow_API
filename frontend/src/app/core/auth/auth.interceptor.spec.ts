import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const token = signal<string | null>('velho');
  let auth: {
    accessToken: typeof token;
    refresh: jasmine.Spy;
    expire: jasmine.Spy;
  };

  beforeEach(() => {
    token.set('velho');
    auth = {
      accessToken: token,
      refresh: jasmine.createSpy('refresh'),
      expire: jasmine.createSpy('expire').and.resolveTo(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  // o refresh é uma Promise: a nova tentativa sai num microtask depois
  const tick = () => new Promise((r) => setTimeout(r));

  it('envia o access token nas rotas da API', () => {
    void firstValueFrom(http.get('/api/v1/boards'));
    const req = backend.expectOne('/api/v1/boards');
    expect(req.request.headers.get('Authorization')).toBe('Bearer velho');
    req.flush({});
  });

  it('não mexe nas rotas públicas de /auth nem fora da API', () => {
    void firstValueFrom(http.post('/api/v1/auth/login', {}));
    void firstValueFrom(http.get('/assets/x.json'));
    expect(
      backend
        .expectOne('/api/v1/auth/login')
        .request.headers.has('Authorization'),
    ).toBeFalse();
    expect(
      backend.expectOne('/assets/x.json').request.headers.has('Authorization'),
    ).toBeFalse();
  });

  it('troca de senha (PATCH /auth/password) leva o token', () => {
    void firstValueFrom(http.patch('/api/v1/auth/password', {}));
    const req = backend.expectOne('/api/v1/auth/password');
    expect(req.request.headers.get('Authorization')).toBe('Bearer velho');
    req.flush({});
  });

  it('no 401 renova o token e repete a chamada uma vez', async () => {
    auth.refresh.and.resolveTo('novo');
    const result = firstValueFrom(http.get('/api/v1/me'));
    backend
      .expectOne('/api/v1/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await tick();
    const retry = backend.expectOne('/api/v1/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer novo');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('sem refresh válido encerra a sessão e repassa o 401', async () => {
    auth.refresh.and.resolveTo(null);
    const result = firstValueFrom(http.get('/api/v1/me'));
    backend
      .expectOne('/api/v1/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await expectAsync(result).toBeRejectedWith(
      jasmine.objectContaining({ status: 401 }),
    );
    expect(auth.expire).toHaveBeenCalled();
  });

  it('outros erros passam direto, sem refresh', async () => {
    const result = firstValueFrom(http.get('/api/v1/me'));
    backend
      .expectOne('/api/v1/me')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    await expectAsync(result).toBeRejectedWith(
      jasmine.objectContaining({ status: 403 }),
    );
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
