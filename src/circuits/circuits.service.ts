import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCircuitDto } from './dto/create-circuit.dto';
import type { UpdateCircuitDto } from './dto/update-circuit.dto';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

@Injectable()
export class CircuitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCircuitDto): Promise<CircuitResponse> {
    return this.prisma.client.circuit.create({
      data: {
        name: dto.name,
        city: dto.city,
        state: dto.state.toUpperCase(),
      },
    });
  }

  async findOne(id: string): Promise<CircuitResponse> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id },
    });

    if (!circuit) {
      throw new NotFoundException('Circuito não encontrado');
    }

    return circuit;
  }

  async update(id: string, dto: UpdateCircuitDto): Promise<CircuitResponse> {
    await this.findOne(id);

    return this.prisma.client.circuit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state.toUpperCase() }),
      },
    });
  }
}
