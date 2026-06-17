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
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateEventPassengerDto } from './dto/create-event-passenger.dto';
import { EventPassengerQueryDto } from './dto/event-passenger-query.dto';
import { ExportPassengersQueryDto } from './dto/export-passengers-query.dto';
import { UpdateEventPassengerDaysDto } from './dto/update-event-passenger-days.dto';
import { EventPassengersService } from './event-passengers.service';
import type {
  EventPassengerResponse,
  PaginatedPassengerResponse,
} from './interfaces/event-passenger-response.interface';

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
    @Query() query: EventPassengerQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedPassengerResponse> {
    return this.eventPassengersService.findByEvent(
      eventId,
      query.page ?? 1,
      query.limit ?? 20,
      user,
      query.paymentStatus,
    );
  }

  @Get('circuits/:circuitId/events/:eventId/passengers/export.pdf')
  async exportPdf(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ExportPassengersQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.eventPassengersService.exportPdf(circuitId, eventId, user, {
      congregationId: query.congregationId,
      includeSensitive: query.includeSensitive,
    });

    // [ACHADO #7] sanitiza o código da congregação antes de compor o filename
    const safeCode = result.congregationCode?.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = safeCode ? `inscritos-${safeCode}-${eventId}.pdf` : `inscritos-${eventId}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(result.buffer);
  }

  @Get('event-passengers/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EventPassengerResponse> {
    return this.eventPassengersService.findOne(id, user);
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
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.eventPassengersService.remove(id, user);
  }
}
