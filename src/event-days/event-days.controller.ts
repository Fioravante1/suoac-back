import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateEventDayDto } from './dto/update-event-day.dto';
import { EventDaysService } from './event-days.service';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

@ApiTags('EventDays')
@Controller()
export class EventDaysController {
  constructor(private readonly eventDaysService: EventDaysService) {}

  @Get('events/:eventId/days')
  async findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<EventDayResponse[]> {
    return this.eventDaysService.findByEvent(eventId, role, userCircuitId);
  }

  @Get('event-days/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.findOne(id, role, userCircuitId);
  }

  @Patch('event-days/:id')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDayDto,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.update(id, dto, userCircuitId);
  }

  @Patch('event-days/:id/cancel')
  @Roles('CIRCUIT_COORDINATOR')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.cancel(id, userCircuitId);
  }
}
