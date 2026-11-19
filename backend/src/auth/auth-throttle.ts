import { ExecutionContext, SetMetadata } from '@nestjs/common';

const AUTH_LIMITED = 'taskflow:auth-limited';

// marca rotas sensíveis a força bruta (login, cadastro, recuperação de senha)
export const AuthRateLimit = () => SetMetadata(AUTH_LIMITED, true);

export const isAuthLimited = (context: ExecutionContext) =>
  Reflect.getMetadata(AUTH_LIMITED, context.getHandler()) === true;
