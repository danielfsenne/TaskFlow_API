import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

const FIELDS: Record<string, string> = {
  name: 'nome',
  email: 'e-mail',
  password: 'senha',
  currentPassword: 'senha atual',
  newPassword: 'nova senha',
  title: 'título',
  description: 'descrição',
  content: 'texto',
  dueDate: 'prazo',
  priority: 'prioridade',
  color: 'cor',
  role: 'papel',
  columnId: 'coluna',
  assigneeId: 'responsável',
  assigneeIds: 'responsáveis',
  labelId: 'etiqueta',
  labelIds: 'etiquetas',
  userIds: 'usuários',
  archived: 'arquivado',
  search: 'busca',
  limit: 'limite',
  token: 'token',
  refreshToken: 'token de renovação',
};

// os números e as listas de valores vêm da mensagem original do class-validator
type Rule = (n: number[], english: string) => string;
const RULES: Record<string, Rule> = {
  isString: () => 'deve ser um texto',
  isNotEmpty: () => 'não pode ficar vazio',
  isEmail: () => 'deve ser um e-mail válido',
  minLength: ([n]) => `deve ter pelo menos ${n} caracteres`,
  maxLength: ([n]) => `deve ter no máximo ${n} caracteres`,
  // o class-validator só cita o limite que foi violado
  isLength: ([n], en) =>
    en.includes('shorter')
      ? `deve ter no máximo ${n} caracteres`
      : `deve ter pelo menos ${n} caracteres`,
  isUuid: () => 'deve ser um identificador válido',
  isIn: (_, en) => `deve ser um destes valores: ${en.split(': ')[1] ?? ''}`,
  isEnum: (_, en) => `deve ser um destes valores: ${en.split(': ')[1] ?? ''}`,
  isInt: () => 'deve ser um número inteiro',
  min: ([n]) => `deve ser no mínimo ${n}`,
  max: ([n]) => `deve ser no máximo ${n}`,
  isBoolean: () => 'deve ser verdadeiro ou falso',
  isDateString: () => 'deve ser uma data válida',
  isArray: () => 'deve ser uma lista',
  arrayMaxSize: ([n]) => `deve ter no máximo ${n} itens`,
  arrayMinSize: ([n]) => `deve ter pelo menos ${n} itens`,
  arrayUnique: () => 'não pode ter itens repetidos',
  isHexadecimal: () => 'deve estar em hexadecimal',
  isJwt: () => 'deve ser um token válido',
};

function translate(path: string, key: string, english: string) {
  const field = path
    .split('.')
    .map((p) => FIELDS[p] ?? p)
    .join('.');
  if (key === 'whitelistValidation') return `o campo ${field} não é aceito`;
  const rule = RULES[key];
  const property = path.split('.').pop()!;
  const each = english.startsWith('each value in ');
  // mensagem personalizada no DTO (ou regra desconhecida): fica como está
  if (!rule || !(each || english.startsWith(`${property} `))) return english;
  const numbers = (english.match(/\d+/g) ?? []).map(Number);
  return `${each ? `cada item de ${field}` : field} ${rule(numbers, english)}`;
}

function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      translate(path, key, msg),
    );
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

export const validationExceptionFactory = (errors: ValidationError[]) =>
  new BadRequestException(flatten(errors));

export const UuidPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('Identificador inválido no endereço'),
});
