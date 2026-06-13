import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { TransitionEventStatusDto } from './dto/transition-event-status.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import type { EventResponse } from './interfaces/event-response.interface';

@ApiTags('Events')
@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('circuits/:circuitId/events')
  @HttpCode(HttpStatus.CREATED)
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async create(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEventDto,
  ): Promise<EventResponse> {
    return this.eventsService.create(circuitId, user, dto);
  }

  @Get('circuits/:circuitId/events')
  async findByCircuit(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Query() query: EventQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<EventResponse>> {
    return this.eventsService.findByCircuit(circuitId, query.page ?? 1, query.limit ?? 20, user, query.status);
  }

  @Get('events/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<EventResponse> {
    return this.eventsService.findOne(id, user);
  }

  @Patch('events/:id')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventResponse> {
    return this.eventsService.update(id, dto, user);
  }

  @Patch('events/:id/status')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionEventStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventResponse> {
    return this.eventsService.transitionStatus(id, dto, user);
  }

  @Patch('events/:id/cancel')
  @Roles('CIRCUIT_COORDINATOR')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<EventResponse> {
    return this.eventsService.cancel(id, user);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.eventsService.remove(id, user);
  }
}
