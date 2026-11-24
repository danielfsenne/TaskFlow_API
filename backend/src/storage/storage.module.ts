import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorage } from './file-storage';
import { LocalStorage } from './local-storage';
import { S3Storage } from './s3-storage';

export function createStorage(config: ConfigService): FileStorage {
  if (config.get<string>('STORAGE_DRIVER') !== 's3') {
    return new LocalStorage(config.getOrThrow<string>('UPLOAD_DIR'));
  }
  const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');
  return new S3Storage(config.getOrThrow<string>('S3_BUCKET'), {
    region: config.get<string>('S3_REGION'),
    endpoint: config.get<string>('S3_ENDPOINT') || undefined,
    forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE'),
    // sem chaves, o SDK usa as credenciais do ambiente (IAM, ~/.aws)
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

@Global()
@Module({
  providers: [
    {
      provide: FileStorage,
      useFactory: createStorage,
      inject: [ConfigService],
    },
  ],
  exports: [FileStorage],
})
export class StorageModule {}
