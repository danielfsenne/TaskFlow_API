import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ConfiguredIoAdapter } from './realtime/socket-io.adapter';

// usado pelo main.ts e pelos testes e2e, para os dois rodarem igual
export function configureApp(app: INestApplication) {
  const corsOrigin = app.get(ConfigService).get<string>('CORS_ORIGIN');

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
    }),
  );
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, corsOrigin));
}
