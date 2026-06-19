import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListEventPaymentsQueryDto } from './dto/list-event-payments-query.dto';
import type { EventPaymentsResponse } from './interfaces/event-payment-row.interface';
import type { PaymentResponse } from './interfaces/payment-response.interface';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('event-passengers/:eventPassengerId/payments')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('eventPassengerId', ParseUUIDPipe) eventPassengerId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResponse> {
    return this.paymentsService.create(eventPassengerId, user, dto);
  }

  @Get('event-passengers/:eventPassengerId/payments')
  async findByEventPassenger(
    @Param('eventPassengerId', ParseUUIDPipe) eventPassengerId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentResponse[]> {
    return this.paymentsService.findByEventPassenger(eventPassengerId, user);
  }

  @Get('events/:eventId/payments')
  async findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListEventPaymentsQueryDto,
  ): Promise<EventPaymentsResponse> {
    return this.paymentsService.findByEvent(eventId, user, query);
  }

  @Delete('payments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.paymentsService.remove(id, user);
  }
}
