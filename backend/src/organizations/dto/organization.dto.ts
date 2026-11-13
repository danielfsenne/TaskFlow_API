import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OrganizationRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** OWNER não pode ser atribuído diretamente: só existe um, o criador. */
export const ASSIGNABLE_ROLES = [
  OrganizationRole.ADMIN,
  OrganizationRole.MEMBER,
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Minha Empresa' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class AddMemberDto {
  @ApiProperty({ example: 'colega@email.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, default: 'MEMBER' })
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole = OrganizationRole.MEMBER;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}
