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
  @Roles('CIRCUIT_COORDINATOR')
  async create(
    @CurrentUser('circuitId') userCircuitId: string,
    @Body() dto: CreateCircuitDto,
  ): Promise<CircuitResponse> {
    return this.circuitsService.create(userCircuitId, dto);
  }

  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<PaginatedResponse<CircuitResponse>> {
    return this.circuitsService.findAll(query.page ?? 1, query.limit ?? 20, userCircuitId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<CircuitResponse> {
    return this.circuitsService.findOne(id, userCircuitId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCircuitDto,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<CircuitResponse> {
    return this.circuitsService.update(id, dto, userCircuitId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('circuitId') userCircuitId: string): Promise<void> {
    return this.circuitsService.remove(id, userCircuitId);
  }
}
