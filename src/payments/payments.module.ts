import { Module } from '@nestjs/common';
import { PdfModule } from '../common/pdf/pdf.module';
import { CongregationEventStatusModule } from '../congregation-event-status/congregation-event-status.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CongregationEventStatusModule, PdfModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
