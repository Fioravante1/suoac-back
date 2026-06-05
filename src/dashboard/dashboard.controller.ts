import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardService } from './dashboard.service';
import { CongregationDashboardQueryDto } from './dto/congregation-dashboard-query.dto';
import type { CongregationDashboardResponse } from './interfaces/congregation-dashboard-response.interface';

@ApiTags('Dashboard')
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('events/:eventId/congregation-dashboard')
  async getCongregationDashboard(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: CongregationDashboardQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CongregationDashboardResponse> {
    return this.dashboardService.getCongregationDashboard(eventId, user, query.congregationId);
  }
}
