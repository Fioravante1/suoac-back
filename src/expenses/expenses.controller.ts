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
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import type { EventExpensesResponse, ExpenseResponse } from './interfaces/expense-response.interface';
import { ExpensesService } from './expenses.service';

@ApiTags('Expenses')
@Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
@Controller()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('events/:eventId/expenses')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseResponse> {
    return this.expensesService.create(eventId, user, dto);
  }

  @Get('events/:eventId/expenses')
  async findByEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListExpensesQueryDto,
  ): Promise<EventExpensesResponse> {
    return this.expensesService.findByEvent(eventId, user, query);
  }

  @Get('expenses/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<ExpenseResponse> {
    return this.expensesService.findOne(id, user);
  }

  @Patch('expenses/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseResponse> {
    return this.expensesService.update(id, user, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.expensesService.remove(id, user);
  }
}
