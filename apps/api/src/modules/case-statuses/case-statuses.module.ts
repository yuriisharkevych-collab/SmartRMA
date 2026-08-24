import { Module } from '@nestjs/common';
import { CaseStatusesController } from './case-statuses.controller';
import { CaseStatusesRepository } from './case-statuses.repository';
import { CaseStatusesService } from './case-statuses.service';

@Module({
  controllers: [CaseStatusesController],
  providers: [CaseStatusesService, CaseStatusesRepository],
  exports: [CaseStatusesService],
})
export class CaseStatusesModule {}
