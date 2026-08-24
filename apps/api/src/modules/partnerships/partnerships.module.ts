import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PartnershipsController } from './partnerships.controller';
import { PartnershipsRepository } from './partnerships.repository';
import { PartnershipsService } from './partnerships.service';

@Module({
  imports: [AuditModule],
  controllers: [PartnershipsController],
  providers: [PartnershipsService, PartnershipsRepository],
  exports: [PartnershipsService],
})
export class PartnershipsModule {}
