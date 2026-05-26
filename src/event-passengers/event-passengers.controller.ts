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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateEventPassengerDto } from './dto/create-event-passenger.dto';
import { UpdateEventPassengerDaysDto } from './dto/update-event-passenger-days.dto';
import { EventPassengersService } from './event-passengers.service';
import type { EventPassengerResponse } from './interfaces/event-passenger-response.interface';

@ApiTags('EventPassengers')
@Controller()
export class EventPassengersController {
  constructor(private readonly eventPassengersService: EventPassengersService) {}

  @Post('events/:eventId/passengers')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEventPassengerDto,
  ): Promise<EventPassengerResponse> {
    return this.eventPassengersService.create(eventId, user, dto);
  }

  @Get('events/:eventId/passengers')
  async findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<EventPassengerResponse>> {
    return this.eventPassengersService.findByEvent(eventId, query.page ?? 1, query.limit ?? 20, user);
  }

  @Get('event-passengers/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<EventPassengerResponse> {
    return this.eventPassengersService.findOne(id);
  }

  @Patch('event-passengers/:id/days')
  async updateDays(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventPassengerDaysDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventPassengerResponse> {
    return this.eventPassengersService.updateDays(id, dto, user);
  }

  @Delete('event-passengers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.eventPassengersService.remove(id, user);
  }
}
