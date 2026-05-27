import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
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

  @Delete('payments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.paymentsService.remove(id, user);
  }
}
