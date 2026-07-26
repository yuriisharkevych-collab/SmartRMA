import { Injectable } from '@nestjs/common';
import { ManufacturerReportEntity } from './entities/manufacturer-report.entity';
import { ReportsRepository } from './reports.repository';

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async getManufacturerReport(manufacturerId: string): Promise<ManufacturerReportEntity> {
    const [caseCount, durations] = await Promise.all([
      this.reportsRepository.countCasesForManufacturer(manufacturerId),
      this.reportsRepository.findClosedCaseDurations(manufacturerId),
    ]);

    const averageResolutionDays =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : null;

    return { manufacturerId, caseCount, averageResolutionDays };
  }
}
