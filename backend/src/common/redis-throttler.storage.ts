import { Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis, { RedisOptions } from 'ioredis';

// janela fixa: conta os acessos; passou do limite, bloqueia e zera a contagem
const SCRIPT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then
  return {tonumber(ARGV[2]) + 1, blocked, 1, blocked}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

// Contagem compartilhada entre as instâncias da API. Se o Redis cair,
// cada instância passa a contar na própria memória até ele voltar.
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger('RateLimit');
  private readonly redis: Redis;
  private readonly fallback = new ThrottlerStorageService();
  private warned = false;

  constructor(
    options: RedisOptions,
    private readonly prefix: string,
  ) {
    // com o Redis fora, o comando desiste rápido em vez de segurar a requisição
    this.redis = new Redis({
      ...options,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () => undefined);
    this.redis.on('ready', () => (this.warned = false));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    const base = `${this.prefix}${throttlerName}:${key}`;
    try {
      // já caiu e está tentando voltar: nem espera o tempo limite
      if (['reconnecting', 'end', 'close'].includes(this.redis.status)) {
        throw new Error(`conexão ${this.redis.status}`);
      }
      const [totalHits, expire, isBlocked, blockExpire] =
        (await this.redis.eval(
          SCRIPT,
          2,
          `${base}:hits`,
          `${base}:block`,
          ttl,
          limit,
          blockDuration,
        )) as number[];
      return {
        totalHits,
        timeToExpire: seconds(expire),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: seconds(blockExpire),
      };
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Redis indisponível, limite contado só nesta instância: ${(e as Error).message}`,
        );
      }
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  // chamado duas vezes: o ThrottlerModule também registra esta instância
  onApplicationShutdown() {
    this.fallback.onApplicationShutdown();
    if (this.redis.status !== 'end') this.redis.disconnect();
  }
}

@Module({
  providers: [
    {
      provide: RedisThrottlerStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new RedisThrottlerStorage(
          {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
          config.get<string>('THROTTLE_KEY_PREFIX') ??
            `${config.get<string>('QUEUE_PREFIX')}:throttle:`,
        ),
    },
  ],
  exports: [RedisThrottlerStorage],
})
export class RateLimitStorageModule {}
