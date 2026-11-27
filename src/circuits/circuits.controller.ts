import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import type { CircuitSummaryResponse } from './interfaces/circuit-summary-response.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CircuitsService } from './circuits.service';
import { UpdateCircuitDto } from './dto/update-circuit.dto';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

@ApiTags('Circuits')
@Controller('circuits')
export class CircuitsController {
  constructor(private readonly circuitsService: CircuitsService) {}

  @Get('me')
  async findOwn(@CurrentUser() user: JwtPayload): Promise<CircuitResponse> {
    return this.circuitsService.findOwn(user);
  }

  @Get(':circuitId/summary')
  @Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')
  @ApiOkResponse({
    description: 'Contagens de congregações ativas, coordenadores ativos e convites pendentes',
    schema: {
      type: 'object',
      required: ['activeCongregationCount', 'activeCoordinatorCount', 'pendingInvitationCount'],
      properties: {
        activeCongregationCount: { type: 'integer' },
        activeCoordinatorCount: { type: 'integer' },
        pendingInvitationCount: { type: 'integer' },
      },
    },
  })
  async getSummary(
    @Param('circuitId', ParseUUIDPipe) circuitId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CircuitSummaryResponse> {
    return this.circuitsService.getSummary(circuitId, user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<CircuitResponse> {
    return this.circuitsService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCircuitDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CircuitResponse> {
    return this.circuitsService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.circuitsService.remove(id, user);
  }
}
