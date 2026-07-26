import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

/** `code` niezmienne po utworzeniu — jest identyfikatorem używanym w kodzie/gatingu UI. */
export class UpdateRoleDto extends PartialType(OmitType(CreateRoleDto, ['code'] as const)) {}
