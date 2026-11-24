import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { isAuthLimited } from './auth/auth-throttle';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CommentsModule } from './comments/comments.module';
import { validateEnv } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeCoreModule } from './realtime/realtime-core.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { SearchModule } from './search/search.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
        // prefixo próprio deixa os testes e2e rodarem junto com a API de dev
        prefix: config.get<string>('QUEUE_PREFIX'),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        errorMessage: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
        throttlers: [
          // teto geral por IP, só contra abuso
          { name: 'default', ttl: 60_000, limit: 600 },
          {
            name: 'auth',
            ttl: 60_000,
            limit: config.get<number>('THROTTLE_AUTH_LIMIT', 10),
            skipIf: (context) => !isAuthLimited(context),
          },
        ],
      }),
    }),
    PrismaModule,
    StorageModule,
    RealtimeCoreModule,
    HealthModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    OrganizationsModule,
    InvitationsModule,
    ProjectsModule,
    BoardsModule,
    TasksModule,
    CommentsModule,
    AttachmentsModule,
    DashboardModule,
    SearchModule,
    RemindersModule,
    RealtimeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
