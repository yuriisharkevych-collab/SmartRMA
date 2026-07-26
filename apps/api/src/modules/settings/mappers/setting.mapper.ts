import { Setting } from '@prisma/client';
import { SettingEntity } from '../entities/setting.entity';

export class SettingMapper {
  static toEntity(setting: Setting): SettingEntity {
    const { id, companyId, key, value, type, description } = setting;
    return { id, companyId, key, value, type, description };
  }

  static toEntityList(settings: Setting[]): SettingEntity[] {
    return settings.map(SettingMapper.toEntity);
  }
}
