import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

export const DEFAULT_COLUMNS = ['A fazer', 'Em andamento', 'Concluído'];

export class CreateBoardDto {
  @ApiProperty({ example: 'Sprint 1' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    description:
      'Colunas iniciais, em ordem. Padrão: ' + DEFAULT_COLUMNS.join(', '),
    example: DEFAULT_COLUMNS,
  })
  @Transform(trimEach)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  columns?: string[];
}

export class UpdateBoardDto {
  @ApiProperty({ example: 'Sprint 2' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class CreateColumnDto {
  @ApiProperty({ example: 'Em revisão' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}

export class UpdateColumnDto extends CreateColumnDto {}

export class MoveColumnDto {
  @ApiProperty({
    nullable: true,
    description:
      'Coluna que ficará imediatamente antes desta; null move para o início',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  afterColumnId!: string | null;
}
