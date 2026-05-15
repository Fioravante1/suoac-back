import { Module } from '@nestjs/common';
import { CircuitsController } from './circuits.controller';
import { CircuitsService } from './circuits.service';

@Module({
  controllers: [CircuitsController],
  providers: [CircuitsService],
  exports: [CircuitsService],
})
export class CircuitsModule {}
