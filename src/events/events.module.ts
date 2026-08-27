import { Module } from '@nestjs/common';
import { EventLifecycleService } from './event-lifecycle.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventLifecycleService],
  exports: [EventsService],
})
export class EventsModule {}
