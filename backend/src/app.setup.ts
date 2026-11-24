import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { validationExceptionFactory } from './common/validation';
import { ConfiguredIoAdapter } from './realtime/socket-io.adapter';

// usado pelo main.ts e pelos testes e2e, para os dois rodarem igual
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      // a API só devolve JSON e imagens; a CSP fica para quem serve o HTML
      contentSecurityPolicy: false,
      // avatares podem ser exibidos pelo frontend em outra origem
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useWebSocketAdapter(
    new ConfiguredIoAdapter(app, corsOrigin, {
      host: config.get<string>('REDIS_HOST'),
      port: config.get<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      key: `${config.get<string>('QUEUE_PREFIX')}:socket.io`,
    }),
  );
}
