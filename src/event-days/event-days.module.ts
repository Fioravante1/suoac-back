import { Module } from '@nestjs/common';
import { EventDaysController } from './event-days.controller';
import { EventDaysService } from './event-days.service';

@Module({
  controllers: [EventDaysController],
  providers: [EventDaysService],
  exports: [EventDaysService],
})
export class EventDaysModule {}
