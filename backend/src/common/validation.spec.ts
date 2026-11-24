import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UuidPipe, validationExceptionFactory } from './validation';

class Column {
  @IsString()
  @MaxLength(5)
  name!: string;
}

class Dto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(['LOW', 'HIGH'])
  priority?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(2)
  labelIds?: string[];

  @IsOptional()
  @Length(2, 4)
  code?: string;

  @IsOptional()
  @MinLength(3, { message: 'Mensagem própria' })
  title?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => Column)
  columns?: Column[];
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});

async function messages(body: object) {
  try {
    await pipe.transform(body, { type: 'body', metatype: Dto });
  } catch (e) {
    return (e as BadRequestException).getResponse() as { message: string[] };
  }
  throw new Error('deveria falhar');
}

describe('mensagens de validação', () => {
  it('traduz as regras e os nomes de campo conhecidos', async () => {
    const { message } = await messages({
      email: 'x',
      password: 'curta',
      priority: 'MAX',
      code: 'abcdef',
    });
    expect(message).toEqual([
      'e-mail deve ser um e-mail válido',
      'senha deve ter pelo menos 8 caracteres',
      'prioridade deve ser um destes valores: LOW, HIGH',
      'code deve ter no máximo 4 caracteres',
    ]);
  });

  it('cobre listas, objetos aninhados e campos não aceitos', async () => {
    const { message } = await messages({
      email: 'a@b.com',
      password: 'SenhaForte123',
      labelIds: ['x', 'y', 'z'],
      columns: [{ name: 'longo demais' }],
      extra: 1,
    });
    expect(message).toEqual([
      'o campo extra não é aceito',
      'etiquetas deve ter no máximo 2 itens',
      'cada item de etiquetas deve ser um identificador válido',
      'columns.0.nome deve ter no máximo 5 caracteres',
    ]);
  });

  it('mantém mensagens escritas no próprio DTO', async () => {
    const { message } = await messages({
      email: 'a@b.com',
      password: 'SenhaForte123',
      title: 'ab',
    });
    expect(message).toEqual(['Mensagem própria']);
  });

  it('UUID inválido na URL vira mensagem em português', async () => {
    await expect(
      UuidPipe.transform('abc', { type: 'param', data: 'id' }),
    ).rejects.toThrow('Identificador inválido no endereço');
  });
});
