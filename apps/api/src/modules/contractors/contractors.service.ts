import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractorsRepository } from './contractors.repository';
import { CreateContractorDto } from './dto/create-contractor.dto';
import { UpdateContractorDto } from './dto/update-contractor.dto';
import { ContractorEntity } from './entities/contractor.entity';
import { ContractorMapper } from './mappers/contractor.mapper';

@Injectable()
export class ContractorsService {
  constructor(private readonly contractorsRepository: ContractorsRepository) {}

  async findAllForCompany(companyId: string): Promise<ContractorEntity[]> {
    return ContractorMapper.toEntityList(
      await this.contractorsRepository.findAllForCompany(companyId),
    );
  }

  async findById(id: string, companyId: string): Promise<ContractorEntity> {
    const contractor = await this.contractorsRepository.findById(id, companyId);
    if (!contractor) throw new NotFoundException();
    return ContractorMapper.toEntity(contractor);
  }

  /**
   * TODO(CONTRACTOR-001): kolizja NIP w obrębie firmy dziś kończy się gołym
   * błędem Prisma `P2002` (naruszenie `@@unique([companyId, nip])`) — brakuje
   * przechwycenia i przemapowania na `AppException(ERROR_CODES.CONTRACTOR_001)`.
   * Nie dodane tutaj celowo: łapanie `P2002` "na ślepo" ryzykowałoby ukrycie
   * innych, nieoczekiwanych błędów zapisu pod niewłaściwym kodem — do
   * zrobienia razem z resztą walidacji przy implementacji logiki.
   */
  async create(companyId: string, dto: CreateContractorDto): Promise<ContractorEntity> {
    return ContractorMapper.toEntity(await this.contractorsRepository.create(companyId, dto));
  }

  async update(id: string, companyId: string, dto: UpdateContractorDto): Promise<ContractorEntity> {
    await this.findById(id, companyId);
    return ContractorMapper.toEntity(await this.contractorsRepository.update(id, dto));
  }
}
