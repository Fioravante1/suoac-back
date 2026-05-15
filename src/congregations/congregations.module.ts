import { Module } from '@nestjs/common';
import { CongregationsController } from './congregations.controller';
import { CongregationsService } from './congregations.service';

@Module({
  controllers: [CongregationsController],
  providers: [CongregationsService],
  exports: [CongregationsService],
})
export class CongregationsModule {}
