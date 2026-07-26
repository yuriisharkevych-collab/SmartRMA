import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ContractorsRepository } from './contractors.repository';
import { ContractorsService } from './contractors.service';

@Module({
  controllers: [ContractorsController],
  providers: [ContractorsService, ContractorsRepository],
  exports: [ContractorsService],
})
export class ContractorsModule {}
