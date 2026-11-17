import { effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { AuthService } from './auth/auth.service';

export interface BoardEvent {
  actorId: string;
  [key: string]: unknown;
}

type Ack = { ok: true } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);

  private socket: Socket | null = null;
  private readonly boards = new Set<string>();
  private readonly events = new Subject<{ event: string; payload: unknown }>();
  private readonly reconnects = new Subject<void>();
  private renewing = false;

  readonly connected = signal(false);
  readonly reconnected$ = this.reconnects.asObservable();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) this.connect();
      else this.disconnect();
    });
  }

  on<T = BoardEvent>(event: string): Observable<T> {
    return new Observable<T>((sub) => {
      const s = this.events.subscribe((e) => {
        if (e.event === event) sub.next(e.payload as T);
      });
      return () => s.unsubscribe();
    });
  }

  async joinBoard(boardId: string): Promise<boolean> {
    this.boards.add(boardId);
    return this.join(boardId);
  }

  leaveBoard(boardId: string) {
    this.boards.delete(boardId);
    this.socket?.emit('board:leave', { boardId });
  }

  private connect() {
    if (this.socket) return;
    const socket = io('/realtime', {
      // função: cada reconexão pega o token atual
      auth: (cb) => cb({ token: this.auth.accessToken() }),
      transports: ['websocket'],
    });
    this.socket = socket;
    let wasConnected = false;

    socket.on('connect', () => {
      this.zone.run(() => this.connected.set(true));
      for (const id of this.boards) void this.join(id);
      if (wasConnected) this.zone.run(() => this.reconnects.next());
      wasConnected = true;
    });
    socket.on('disconnect', () =>
      this.zone.run(() => this.connected.set(false)),
    );
    socket.on('session.expired', () => void this.renewAndReconnect());
    socket.on('connect_error', (err) => {
      if (err.message === 'Não autenticado') void this.renewAndReconnect();
    });
    socket.onAny((event: string, payload: unknown) =>
      this.zone.run(() => this.events.next({ event, payload })),
    );
  }

  private disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.boards.clear();
    this.connected.set(false);
  }

  private async renewAndReconnect() {
    if (this.renewing || !this.socket) return;
    this.renewing = true;
    try {
      const token = await this.auth.refresh();
      if (!token) {
        await this.auth.expire();
        return;
      }
      this.socket?.disconnect().connect();
    } finally {
      this.renewing = false;
    }
  }

  private async join(boardId: string): Promise<boolean> {
    if (!this.socket?.connected) return false;
    try {
      const ack: Ack = await this.socket
        .timeout(5000)
        .emitWithAck('board:join', { boardId });
      return ack.ok;
    } catch {
      return false;
    }
  }
}
