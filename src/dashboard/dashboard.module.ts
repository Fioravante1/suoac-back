import { Module } from '@nestjs/common';
import { PdfModule } from '../common/pdf/pdf.module';
import { XlsxModule } from '../common/xlsx/xlsx.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PdfModule, XlsxModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
