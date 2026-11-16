import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const MAX_ASSIGNEES = 10;

export class CreateTaskDto {
  @ApiProperty({ example: 'Criar tela de login' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Coluna de destino; padrão é a primeira coluna do quadro',
  })
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '2026-12-01T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs dos responsáveis' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_ASSIGNEES)
  @IsUUID('all', { each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ nullable: true, description: 'null remove o prazo' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  dueDate?: string | null;
}

export class MoveTaskDto {
  @ApiProperty({ description: 'Coluna de destino (do mesmo quadro)' })
  @IsUUID()
  columnId!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Tarefa que ficará imediatamente acima desta; null coloca no topo',
  })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  afterTaskId!: string | null;
}

export class SetAssigneesDto {
  @ApiProperty({
    type: [String],
    description: 'Lista completa de responsáveis',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_ASSIGNEES)
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class ListTasksQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @ApiPropertyOptional({ description: 'Apenas tarefas deste responsável' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Busca no título' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
