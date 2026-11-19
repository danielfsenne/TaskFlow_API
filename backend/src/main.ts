import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
  // atrás de proxy (nginx, load balancer), o IP real vem no X-Forwarded-For
  if (config.get<boolean>('TRUST_PROXY')) app.set('trust proxy', 1);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TaskFlow API')
    .setDescription('API de gerenciamento de projetos e tarefas')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`API rodando em http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`Swagger em http://localhost:${port}/api/docs`, 'Bootstrap');
}
bootstrap();
