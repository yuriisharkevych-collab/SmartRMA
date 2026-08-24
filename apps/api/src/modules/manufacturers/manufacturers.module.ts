import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ManufacturersController } from './manufacturers.controller';
import { ManufacturersRepository } from './manufacturers.repository';
import { ManufacturersService } from './manufacturers.service';

@Module({
  imports: [AuditModule],
  controllers: [ManufacturersController],
  providers: [ManufacturersService, ManufacturersRepository],
  exports: [ManufacturersService],
})
export class ManufacturersModule {}
