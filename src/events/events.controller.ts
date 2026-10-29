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
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { TransitionEventStatusDto } from './dto/transition-event-status.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import type { EventResponse, EventWithDaysResponse } from './interfaces/event-response.interface';

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
  ): Promise<EventWithDaysResponse> {
    return this.eventsService.create(circuitId, user, dto);
  }

  @Get('circuits/:circuitId/events')
  @ApiOkResponse({ description: 'Eventos do circuito, paginados, cada um com os dias.' })
  async findByCircuit(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Query() query: EventQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<EventWithDaysResponse>> {
    return this.eventsService.findByCircuit(circuitId, query.page ?? 1, query.limit ?? 20, user, query.status);
  }

  @Get('circuits/:circuitId/events/current')
  @ApiOkResponse({ description: 'Evento atual do circuito, com os dias, pela regra do evento padrão.' })
  @ApiNoContentResponse({ description: 'O circuito não tem evento atual.' })
  async findCurrent(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EventWithDaysResponse | undefined> {
    const event = await this.eventsService.findCurrent(circuitId, user);

    // Circuito sem evento atual não é erro: 204 sem corpo, em vez de 200 com `null`.
    if (!event) {
      reply.status(HttpStatus.NO_CONTENT);
      return undefined;
    }

    return event;
  }

  @Get('events/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventWithDaysResponse> {
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
