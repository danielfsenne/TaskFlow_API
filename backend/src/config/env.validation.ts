import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:4200';

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsInt()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  // "false" viraria true com a conversão implícita
  @Transform(
    ({ obj }) => obj.TRUST_PROXY === 'true' || obj.TRUST_PROXY === true,
  )
  @IsBoolean()
  TRUST_PROXY: boolean = false;

  // tentativas por minuto, por IP, em login/cadastro/recuperação de senha
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT: number = 10;

  // padrão: "<QUEUE_PREFIX>:throttle:"; os testes usam um por arquivo
  @IsString()
  @IsOptional()
  THROTTLE_KEY_PREFIX?: string;

  // endereço do frontend, usado nos links enviados por e-mail
  @IsString()
  APP_URL: string = 'http://localhost:4200';

  @IsString()
  SMTP_HOST: string = 'localhost';

  @IsInt()
  SMTP_PORT: number = 1025;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsString()
  MAIL_FROM: string = 'TaskFlow <nao-responda@taskflow.local>';

  // fotos e anexos: "local" (pasta UPLOAD_DIR) ou "s3" (S3 ou compatível)
  @IsIn(['local', 's3'])
  STORAGE_DRIVER: 'local' | 's3' = 'local';

  @IsString()
  UPLOAD_DIR: string = 'uploads';

  @ValidateIf((o) => o.STORAGE_DRIVER === 's3')
  @IsString()
  @MinLength(3)
  S3_BUCKET?: string;

  @IsString()
  S3_REGION: string = 'us-east-1';

  // só para S3 compatível (ex.: http://localhost:9000 no MinIO)
  @IsString()
  @IsOptional()
  S3_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  S3_SECRET_ACCESS_KEY?: string;

  @Transform(
    ({ obj }) =>
      obj.S3_FORCE_PATH_STYLE === 'true' || obj.S3_FORCE_PATH_STYLE === true,
  )
  @IsBoolean()
  S3_FORCE_PATH_STYLE: boolean = false;

  @IsString()
  QUEUE_PREFIX: string = 'bull';

  // de quanto em quanto tempo procurar prazos próximos; 0 desliga
  @IsInt()
  @Min(0)
  REMINDERS_INTERVAL_MINUTES: number = 15;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Variáveis de ambiente inválidas: ${messages}`);
  }

  return validated;
}
