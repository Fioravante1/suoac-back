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
import { CreatePassengerDto } from './dto/create-passenger.dto';
import { PassengerFilterQueryDto } from './dto/passenger-filter-query.dto';
import { SearchPassengerQueryDto } from './dto/search-passenger-query.dto';
import { UpdatePassengerDto } from './dto/update-passenger.dto';
import type { PassengerResponse } from './interfaces/passenger-response.interface';
import { PassengersService } from './passengers.service';

@ApiTags('Passengers')
@Controller()
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  @Post('congregations/:congregationId/passengers')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('congregationId', ParseUUIDPipe) congregationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePassengerDto,
  ): Promise<PassengerResponse> {
    return this.passengersService.create(congregationId, dto, user);
  }

  @Get('congregations/:congregationId/passengers')
  async findByCongregation(
    @Param('congregationId', ParseUUIDPipe) congregationId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<PassengerResponse>> {
    return this.passengersService.findByCongregation(congregationId, query.page ?? 1, query.limit ?? 20, user);
  }

  @Get('congregations/:congregationId/passengers/search')
  async search(
    @Param('congregationId', ParseUUIDPipe) congregationId: string,
    @Query() query: SearchPassengerQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<PassengerResponse>> {
    return this.passengersService.search(congregationId, query.q, query.page ?? 1, query.limit ?? 20, user);
  }

  @Get('circuits/:circuitId/passengers')
  async findByCircuit(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Query() query: PassengerFilterQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponse<PassengerResponse>> {
    return this.passengersService.findByCircuit(circuitId, query, user);
  }

  @Get('passengers/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<PassengerResponse> {
    return this.passengersService.findOne(id, user);
  }

  @Patch('passengers/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePassengerDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PassengerResponse> {
    return this.passengersService.update(id, dto, user);
  }

  @Delete('passengers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.passengersService.remove(id, user);
  }
}
