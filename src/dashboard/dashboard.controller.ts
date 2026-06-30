import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ExportFormatQueryDto } from '../common/dto/export-format-query.dto';
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

  @Get('circuits/:circuitId/events/:eventId/financial-summary/export')
  async exportFinancialSummary(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ExportFormatQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.dashboardService.exportFinancialSummary(circuitId, eventId, user, query.format ?? 'pdf');

    return reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.buffer);
  }
}
