import { Module } from '@nestjs/common';
import { PdfModule } from '../common/pdf/pdf.module';
import { XlsxModule } from '../common/xlsx/xlsx.module';
import { CongregationEventStatusModule } from '../congregation-event-status/congregation-event-status.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CongregationEventStatusModule, PdfModule, XlsxModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
