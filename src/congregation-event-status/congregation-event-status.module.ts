import { Module } from '@nestjs/common';
import { CongregationEventStatusController } from './congregation-event-status.controller';
import { CongregationEventStatusService } from './congregation-event-status.service';

@Module({
  controllers: [CongregationEventStatusController],
  providers: [CongregationEventStatusService],
  exports: [CongregationEventStatusService],
})
export class CongregationEventStatusModule {}
