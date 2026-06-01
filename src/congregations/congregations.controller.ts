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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CongregationsService } from './congregations.service';
import { CreateCongregationDto } from './dto/create-congregation.dto';
import { UpdateCongregationDto } from './dto/update-congregation.dto';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

@ApiTags('Congregations')
@Controller()
export class CongregationsController {
  constructor(private readonly congregationsService: CongregationsService) {}

  @Post('circuits/:circuitId/congregations')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Body() dto: CreateCongregationDto,
  ): Promise<CongregationResponse> {
    return this.congregationsService.create(circuitId, dto);
  }

  @Get('circuits/:circuitId/congregations')
  async findByCircuit(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<CongregationResponse>> {
    return this.congregationsService.findByCircuit(circuitId, query.page ?? 1, query.limit ?? 20);
  }

  @Get('congregations/:id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<CongregationResponse> {
    return this.congregationsService.findOne(id, userCircuitId);
  }

  @Patch('congregations/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCongregationDto,
    @CurrentUser('circuitId') userCircuitId: string,
  ): Promise<CongregationResponse> {
    return this.congregationsService.update(id, dto, userCircuitId);
  }

  @Delete('congregations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('circuitId') userCircuitId: string): Promise<void> {
    return this.congregationsService.remove(id, userCircuitId);
  }
}
