import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import type { DashboardResponse } from './interfaces/congregation-dashboard-response.interface';
import type { FinancialSummaryResponse } from './interfaces/financial-summary-response.interface';

@ApiTags('Dashboard')
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('events/:eventId/dashboard')
  async getDashboard(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(eventId, user, query.congregationId);
  }

  @Get('events/:eventId/financial-summary')
  async getFinancialSummary(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<FinancialSummaryResponse> {
    return this.dashboardService.getFinancialSummary(eventId, user);
  }
}
