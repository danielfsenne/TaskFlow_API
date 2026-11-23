import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// paleta fixa: o frontend tem fundo e texto legíveis para cada uma
export const LABEL_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;

export class CreateLabelDto {
  @ApiProperty({ example: 'bug' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;

  @ApiProperty({ enum: LABEL_COLORS })
  @IsIn(LABEL_COLORS)
  color!: (typeof LABEL_COLORS)[number];
}

export class UpdateLabelDto extends PartialType(CreateLabelDto) {}
