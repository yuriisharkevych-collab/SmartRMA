import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateManufacturerDto } from './create-manufacturer.dto';

export class UpdateManufacturerDto extends PartialType(OmitType(CreateManufacturerDto, ['contractorId'] as const)) {}
