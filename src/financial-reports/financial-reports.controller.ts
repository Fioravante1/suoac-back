import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FinancialReportQueryDto } from './dto/financial-report-query.dto';
import type { EventFinancialReportResponse } from './interfaces/event-financial-report-response.interface';
import { FinancialReportsService } from './financial-reports.service';

@ApiTags('FinancialReports')
@Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
@Controller()
export class FinancialReportsController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Get('circuits/:circuitId/events/:eventId/financial-report')
  async getEventFinancialReport(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query() _query: FinancialReportQueryDto,
  ): Promise<EventFinancialReportResponse> {
    return this.financialReportsService.buildEventFinancialReport(circuitId, eventId, user);
  }
}
