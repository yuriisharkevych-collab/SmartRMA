import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/** `roles.manage`. Role systemowe (isSystem=true) tworzy wyłącznie seed — RBAC-003. */
export class CreateRoleDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Identyfikator stabilny, używany w kodzie.' }) @IsString() code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [String], description: 'Permission.id' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
