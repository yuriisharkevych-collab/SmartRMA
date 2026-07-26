import { Injectable } from '@nestjs/common';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingEntity } from './entities/setting.entity';
import { SettingMapper } from './mappers/setting.mapper';
import { SettingsRepository } from './settings.repository';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async findAllForCompany(companyId: string): Promise<SettingEntity[]> {
    return SettingMapper.toEntityList(await this.settingsRepository.findAllVisibleToCompany(companyId));
  }

  async upsert(companyId: string, dto: UpsertSettingDto): Promise<SettingEntity> {
    const setting = await this.settingsRepository.upsertForCompany(companyId, {
      key: dto.key,
      value: dto.value as Parameters<SettingsRepository['upsertForCompany']>[1]['value'],
      type: dto.type,
      description: dto.description,
    });
    return SettingMapper.toEntity(setting);
  }
}
