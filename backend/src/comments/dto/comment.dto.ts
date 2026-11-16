import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCommentDto {
  @ApiProperty({ example: 'Revisei e está ok para subir.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

export class UpdateCommentDto extends CreateCommentDto {}

export class ListCommentsQueryDto {
  @ApiPropertyOptional({
    description: 'ID do último comentário da página anterior',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
