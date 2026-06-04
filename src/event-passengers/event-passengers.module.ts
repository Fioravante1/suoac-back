import { Module } from '@nestjs/common';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { CongregationEventStatusModule } from '../congregation-event-status/congregation-event-status.module';
import { PassengersModule } from '../passengers/passengers.module';
import { EventPassengersController } from './event-passengers.controller';
import { EventPassengersService } from './event-passengers.service';

@Module({
  imports: [PassengersModule, EncryptionModule, CongregationEventStatusModule],
  controllers: [EventPassengersController],
  providers: [EventPassengersService],
  exports: [EventPassengersService],
})
export class EventPassengersModule {}
