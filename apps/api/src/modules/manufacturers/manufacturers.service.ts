import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateManufacturerDto } from './dto/create-manufacturer.dto';
import { UpdateManufacturerDto } from './dto/update-manufacturer.dto';
import { UpdateManufacturerSlaDto } from './dto/update-manufacturer-sla.dto';
import { ManufacturerEntity } from './entities/manufacturer.entity';
import { ManufacturerMapper } from './mappers/manufacturer.mapper';
import { ManufacturersRepository } from './manufacturers.repository';

/** TODO(MANUFACTURER-001/002): walidacja "Contractor istnieje / nie ma jeszcze profilu" nie zaimplementowana — dziś polega wyłącznie na `@@unique` w bazie. */
@Injectable()
export class ManufacturersService {
  constructor(private readonly manufacturersRepository: ManufacturersRepository) {}

  async findAllForCompany(companyId: string): Promise<ManufacturerEntity[]> {
    return ManufacturerMapper.toEntityList(await this.manufacturersRepository.findAllForCompany(companyId));
  }

  async findById(id: string): Promise<ManufacturerEntity> {
    const manufacturer = await this.manufacturersRepository.findById(id);
    if (!manufacturer) throw new NotFoundException();
    return ManufacturerMapper.toEntity(manufacturer);
  }

  async create(companyId: string, dto: CreateManufacturerDto): Promise<ManufacturerEntity> {
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.create(companyId, dto));
  }

  async update(id: string, dto: UpdateManufacturerDto): Promise<ManufacturerEntity> {
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.update(id, dto));
  }

  async updateSla(id: string, dto: UpdateManufacturerSlaDto): Promise<ManufacturerEntity> {
    return ManufacturerMapper.toEntity(await this.manufacturersRepository.upsertSla(id, dto));
  }
}
