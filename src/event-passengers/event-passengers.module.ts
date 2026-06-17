import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { PdfModule } from '../common/pdf/pdf.module';
import { CongregationEventStatusModule } from '../congregation-event-status/congregation-event-status.module';
import { PassengersModule } from '../passengers/passengers.module';
import { EventPassengersController } from './event-passengers.controller';
import { EventPassengersService } from './event-passengers.service';

@Module({
  imports: [PassengersModule, EncryptionModule, CongregationEventStatusModule, PdfModule, AuditLogModule],
  controllers: [EventPassengersController],
  providers: [EventPassengersService],
  exports: [EventPassengersService],
})
export class EventPassengersModule {}
