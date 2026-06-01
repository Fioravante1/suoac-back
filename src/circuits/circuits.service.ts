import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCircuitDto } from './dto/create-circuit.dto';
import type { UpdateCircuitDto } from './dto/update-circuit.dto';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

@Injectable()
export class CircuitsService {
  private readonly logger = new Logger(CircuitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number, userCircuitId: string): Promise<PaginatedResponse<CircuitResponse>> {
    this.logger.debug(`Listando circuitos — page=${page}, limit=${limit}, userCircuitId=${userCircuitId}`);

    const where = { id: userCircuitId };

    const [data, total] = await Promise.all([
      this.prisma.client.circuit.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.circuit.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(userCircuitId: string, dto: CreateCircuitDto): Promise<CircuitResponse> {
    const circuit = await this.prisma.client.circuit.create({
      data: {
        name: dto.name,
        city: dto.city,
        state: dto.state.toUpperCase(),
      },
    });

    this.logger.log(`Circuito criado — id=${circuit.id}, name="${circuit.name}", userCircuitId=${userCircuitId}`);
    return circuit;
  }

  async findOne(id: string, userCircuitId: string): Promise<CircuitResponse> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id },
    });

    if (!circuit) {
      this.logger.warn(`Circuito não encontrado — id=${id}`);
      throw new NotFoundException('Circuito não encontrado');
    }

    if (circuit.id !== userCircuitId) {
      throw new ForbiddenException('Sem permissão para acessar recursos de outro circuito');
    }

    return circuit;
  }

  async update(id: string, dto: UpdateCircuitDto, userCircuitId: string): Promise<CircuitResponse> {
    await this.findOne(id, userCircuitId);

    const circuit = await this.prisma.client.circuit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state.toUpperCase() }),
      },
    });

    this.logger.log(`Circuito atualizado — id=${id}`);
    return circuit;
  }

  async remove(id: string, userCircuitId: string): Promise<void> {
    await this.findOne(id, userCircuitId);

    await this.prisma.client.circuit.delete({
      where: { id },
    });

    this.logger.warn(`Circuito removido (hard-delete) — id=${id}`);
  }
}
