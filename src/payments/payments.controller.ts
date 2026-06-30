import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ExportEventPaymentsQueryDto } from './dto/export-event-payments-query.dto';
import { ListEventPaymentsQueryDto } from './dto/list-event-payments-query.dto';
import { ReceiptQueryDto } from './dto/receipt-query.dto';
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

  @Get('circuits/:circuitId/events/:eventId/payments/export')
  async exportPayments(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ExportEventPaymentsQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.paymentsService.exportPayments(circuitId, eventId, user, query);

    return reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.buffer);
  }

  @Get('circuits/:circuitId/events/:eventId/payments/receipt.pdf')
  async generateReceipt(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() query: ReceiptQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.paymentsService.generateReceipt(circuitId, eventId, user, query.congregationId);

    const safeCode = result.congregationCode.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `recibo-${safeCode}-${eventId}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(result.buffer);
  }

  @Delete('payments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.paymentsService.remove(id, user);
  }
}
