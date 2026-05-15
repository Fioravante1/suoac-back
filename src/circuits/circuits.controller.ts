import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CircuitsService } from './circuits.service';
import { CreateCircuitDto } from './dto/create-circuit.dto';
import { UpdateCircuitDto } from './dto/update-circuit.dto';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

@ApiTags('Circuits')
@Controller('circuits')
export class CircuitsController {
  constructor(private readonly circuitsService: CircuitsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCircuitDto): Promise<CircuitResponse> {
    return this.circuitsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResponse<CircuitResponse>> {
    return this.circuitsService.findAll(query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CircuitResponse> {
    return this.circuitsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCircuitDto): Promise<CircuitResponse> {
    return this.circuitsService.update(id, dto);
  }
}
