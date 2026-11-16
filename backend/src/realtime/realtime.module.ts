import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BoardsModule } from '../boards/boards.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register({}), BoardsModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
