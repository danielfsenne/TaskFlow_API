import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BoardAccessService } from '../boards/board-access.service';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway, SocketData } from './realtime.gateway';

const SECRET = 's'.repeat(32);
const BOARD = '11111111-1111-4111-8111-111111111111';

function fakeSocket(auth: Record<string, unknown> = {}, headers = {}) {
  return {
    handshake: { auth, headers },
    data: {} as Partial<SocketData>,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('RealtimeGateway', () => {
  const jwt = new JwtService();
  const config = { getOrThrow: () => SECRET } as unknown as ConfigService;
  const boardAccess = { getBoardAccess: jest.fn() };
  let gateway: RealtimeGateway;

  const token = (expiresIn = '15m', secret = SECRET) =>
    jwt.signAsync({ sub: 'u1', email: 'u@x.com' }, { secret, expiresIn });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    gateway = new RealtimeGateway(
      jwt,
      config,
      boardAccess as unknown as BoardAccessService,
      new RealtimeEmitter(),
    );
  });

  describe('autenticação no handshake', () => {
    it('aceita token em auth.token', async () => {
      const s = fakeSocket({ token: await token() });
      await gateway.authenticate(s as never);
      expect(s.data.user).toEqual({ id: 'u1', email: 'u@x.com' });
    });

    it('aceita header Authorization', async () => {
      const s = fakeSocket({}, { authorization: `Bearer ${await token()}` });
      await gateway.authenticate(s as never);
      expect(s.data.user?.id).toBe('u1');
    });

    it('rejeita sem token, com assinatura errada ou expirado', async () => {
      await expect(
        gateway.authenticate(fakeSocket() as never),
      ).rejects.toThrow();
      const forged = fakeSocket({ token: await token('15m', 'x'.repeat(32)) });
      await expect(gateway.authenticate(forged as never)).rejects.toThrow();
      const expired = fakeSocket({ token: await token('-1s') });
      await expect(gateway.authenticate(expired as never)).rejects.toThrow();
    });
  });

  it('ao conectar entra na sala do usuário e desconecta quando o token expira', () => {
    jest.useFakeTimers();
    const s = fakeSocket();
    s.data = { user: { id: 'u1', email: 'e' }, expiresAt: Date.now() + 5000 };
    gateway.handleConnection(s as never);
    expect(s.join).toHaveBeenCalledWith('user:u1');

    jest.advanceTimersByTime(4999);
    expect(s.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(s.emit).toHaveBeenCalledWith('session.expired');
    expect(s.disconnect).toHaveBeenCalledWith(true);
  });

  describe('board:join', () => {
    const connected = () => {
      const s = fakeSocket();
      s.data = { user: { id: 'u1', email: 'e' }, expiresAt: 0 };
      return s;
    };

    it('entra na sala quando tem acesso ao quadro', async () => {
      boardAccess.getBoardAccess.mockResolvedValue({});
      const s = connected();
      await expect(
        gateway.joinBoard(s as never, { boardId: BOARD }),
      ).resolves.toEqual({ ok: true });
      expect(boardAccess.getBoardAccess).toHaveBeenCalledWith(BOARD, 'u1');
      expect(s.join).toHaveBeenCalledWith(`board:${BOARD}`);
    });

    it('recusa quadro sem acesso', async () => {
      boardAccess.getBoardAccess.mockRejectedValue(new NotFoundException());
      const s = connected();
      await expect(
        gateway.joinBoard(s as never, { boardId: BOARD }),
      ).resolves.toEqual({ ok: false, error: 'Quadro não encontrado' });
      expect(s.join).not.toHaveBeenCalled();
    });

    it('recusa boardId inválido sem consultar o banco', async () => {
      const s = connected();
      await expect(
        gateway.joinBoard(s as never, { boardId: 'board:outro' }),
      ).resolves.toEqual({ ok: false, error: 'boardId inválido' });
      expect(boardAccess.getBoardAccess).not.toHaveBeenCalled();
    });
  });
});

describe('RealtimeEmitter', () => {
  it('ignora emissões antes de o gateway iniciar', () => {
    const emitter = new RealtimeEmitter();
    expect(() => emitter.toBoard('b', 'task.created', 'u', {})).not.toThrow();
  });

  it('inclui o autor no evento do quadro', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const emitter = new RealtimeEmitter();
    emitter.attach({ to } as never);
    emitter.toBoard('b1', 'task.created', 'u1', { task: { id: 't' } });
    expect(to).toHaveBeenCalledWith('board:b1');
    expect(emit).toHaveBeenCalledWith('task.created', {
      task: { id: 't' },
      actorId: 'u1',
    });
  });
});
