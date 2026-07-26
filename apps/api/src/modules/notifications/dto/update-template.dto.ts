import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateTemplateDto } from './create-template.dto';

/** `code`+`channel` tworzą tożsamość szablonu (`@@unique`) — niezmienne po utworzeniu. */
export class UpdateTemplateDto extends PartialType(OmitType(CreateTemplateDto, ['code', 'channel'] as const)) {}
