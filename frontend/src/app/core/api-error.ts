import { HttpErrorResponse } from '@angular/common/http';

/** Extrai uma mensagem legível de um erro da API (o Nest pode mandar lista). */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Algo deu errado. Tente novamente.',
): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Não foi possível falar com o servidor.';
  const message = (error.error as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message) return message;
  return fallback;
}
