import { Global, Module } from '@nestjs/common';
import { RealtimeEmitter } from './realtime.emitter';

/** Global: os módulos de domínio injetam o emissor sem importar nada. */
@Global()
@Module({
  providers: [RealtimeEmitter],
  exports: [RealtimeEmitter],
})
export class RealtimeCoreModule {}
