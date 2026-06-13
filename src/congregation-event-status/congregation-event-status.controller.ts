import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateCongregationEventStatusDto } from './dto/update-congregation-event-status.dto';
import { CongregationEventStatusService } from './congregation-event-status.service';
import type { CongregationEventStatusResponse } from './interfaces/congregation-event-status-response.interface';

@ApiTags('CongregationEventStatus')
@Controller()
export class CongregationEventStatusController {
  constructor(private readonly congregationEventStatusService: CongregationEventStatusService) {}

  // Sem paginação: retorna todas as congregações do circuito (~10-30).
  // Dashboard precisa da visão completa para o CC/CA; volume limitado pelo tamanho do circuito.
  @Get('events/:eventId/congregation-statuses')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CongregationEventStatusResponse[]> {
    return this.congregationEventStatusService.findByEvent(eventId, user);
  }

  @Patch('events/:eventId/congregation-statuses/:congregationId')
  async updateStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('congregationId', ParseUUIDPipe) congregationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCongregationEventStatusDto,
  ): Promise<CongregationEventStatusResponse> {
    return this.congregationEventStatusService.updateStatus(eventId, congregationId, user, dto);
  }
}
