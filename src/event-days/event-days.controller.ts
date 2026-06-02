import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
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
    @CurrentUser() user: JwtPayload,
  ): Promise<EventDayResponse[]> {
    return this.eventDaysService.findByEvent(eventId, user);
  }

  @Get('event-days/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.findOne(id, user);
  }

  @Patch('event-days/:id')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDayDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.update(id, dto, user);
  }

  @Patch('event-days/:id/cancel')
  @Roles('CIRCUIT_COORDINATOR')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventDayResponse> {
    return this.eventDaysService.cancel(id, user);
  }
}
