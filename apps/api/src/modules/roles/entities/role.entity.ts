import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoleEntity {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = rola systemowa (RBAC.md §1).' })
  companyId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty({ type: [String] }) permissionCodes!: string[];
}
