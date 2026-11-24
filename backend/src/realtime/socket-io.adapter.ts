import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis, { RedisOptions } from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

export interface RealtimeRedis extends RedisOptions {
  key: string;
}

// Com Redis, eventos emitidos numa instância da API chegam aos sockets
// conectados nas outras. Sem Redis no ar, a entrega local continua.
export class ConfiguredIoAdapter extends IoAdapter {
  private readonly logger = new Logger('RealtimeAdapter');
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string | undefined,
    private readonly redis?: RealtimeRedis,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
    });
    if (this.redis) {
      const { key, ...opts } = this.redis;
      const pub = new Redis(opts);
      const sub = pub.duplicate();
      for (const c of [pub, sub]) {
        c.on('error', (e) => this.logger.warn(`Redis: ${e.message}`));
      }
      this.clients.push(pub, sub);
      server.adapter(createAdapter(pub, sub, { key }));
    }
    return server;
  }

  async dispose() {
    await super.dispose();
    await Promise.all(
      this.clients.map((c) => c.quit().catch(() => c.disconnect())),
    );
    this.clients = [];
  }
}
