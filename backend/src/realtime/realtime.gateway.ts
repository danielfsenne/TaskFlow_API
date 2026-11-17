import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { AccessTokenPayload, AuthUser } from '../auth/types/auth-user';
import { BoardAccessService } from '../boards/board-access.service';
import { boardRoom, userRoom } from './realtime-events';
import { RealtimeEmitter } from './realtime.emitter';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SocketData {
  user: AuthUser;
  expiresAt: number;
  expiryTimer?: NodeJS.Timeout;
}

type AuthedSocket = Socket & { data: SocketData };

type Ack = { ok: true } | { ok: false; error: string };

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly boardAccess: BoardAccessService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Namespace) {
    this.emitter.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket as AuthedSocket)
        .then(() => next())
        .catch(() => next(new Error('Não autenticado')));
    });
  }

  async authenticate(socket: AuthedSocket) {
    const token = extractToken(socket);
    if (!token) throw new Error('sem token');
    const payload = await this.jwt.verifyAsync<
      AccessTokenPayload & { exp: number }
    >(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
    socket.data.user = { id: payload.sub, email: payload.email };
    socket.data.expiresAt = payload.exp * 1000;
  }

  handleConnection(socket: AuthedSocket) {
    const { user, expiresAt } = socket.data;
    void socket.join(userRoom(user.id));

    const ms = Math.max(0, expiresAt - Date.now());
    socket.data.expiryTimer = setTimeout(() => {
      socket.emit('session.expired');
      socket.disconnect(true);
    }, ms);
  }

  handleDisconnect(socket: AuthedSocket) {
    clearTimeout(socket.data.expiryTimer);
  }

  @SubscribeMessage('board:join')
  async joinBoard(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { boardId?: unknown },
  ): Promise<Ack> {
    const boardId = body?.boardId;
    if (typeof boardId !== 'string' || !UUID.test(boardId)) {
      return { ok: false, error: 'boardId inválido' };
    }
    try {
      await this.boardAccess.getBoardAccess(boardId, socket.data.user.id);
    } catch (e) {
      if (e instanceof NotFoundException) {
        return { ok: false, error: 'Quadro não encontrado' };
      }
      this.logger.error(e);
      return { ok: false, error: 'Erro interno' };
    }
    await socket.join(boardRoom(boardId));
    return { ok: true };
  }

  @SubscribeMessage('board:leave')
  async leaveBoard(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { boardId?: unknown },
  ): Promise<Ack> {
    if (typeof body?.boardId === 'string') {
      await socket.leave(boardRoom(body.boardId));
    }
    return { ok: true };
  }
}

function extractToken(socket: Socket): string | undefined {
  const fromAuth = (socket.handshake.auth as { token?: unknown })?.token;
  if (typeof fromAuth === 'string' && fromAuth) {
    return fromAuth.replace(/^Bearer\s+/i, '');
  }
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}
