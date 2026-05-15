import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCongregationDto } from './dto/create-congregation.dto';
import type { UpdateCongregationDto } from './dto/update-congregation.dto';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

@Injectable()
export class CongregationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(circuitId: string, dto: CreateCongregationDto): Promise<CongregationResponse> {
    await this.ensureCircuitExists(circuitId);

    const existing = await this.prisma.client.congregation.findFirst({
      where: {
        OR: [{ code: dto.code }, { email: dto.email }],
      },
    });

    if (existing) {
      const field = existing.code === dto.code ? 'code' : 'email';
      throw new ConflictException(`Já existe uma congregação com este ${field}`);
    }

    return this.prisma.client.congregation.create({
      data: {
        code: dto.code,
        name: dto.name,
        email: dto.email,
        city: dto.city,
        circuitId,
      },
    });
  }

  async findByCircuit(
    circuitId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<CongregationResponse>> {
    await this.ensureCircuitExists(circuitId);

    const where = { circuitId, isActive: true };

    const [data, total] = await Promise.all([
      this.prisma.client.congregation.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.congregation.count({ where }),
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

  async findOne(id: string): Promise<CongregationResponse> {
    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id },
    });

    if (!congregation) {
      throw new NotFoundException('Congregação não encontrada');
    }

    return congregation;
  }

  async update(id: string, dto: UpdateCongregationDto): Promise<CongregationResponse> {
    await this.findOne(id);

    if (dto.code !== undefined || dto.email !== undefined) {
      const conditions: Array<{ code: string } | { email: string }> = [];
      if (dto.code !== undefined) {
        conditions.push({ code: dto.code });
      }
      if (dto.email !== undefined) {
        conditions.push({ email: dto.email });
      }

      const existing = await this.prisma.client.congregation.findFirst({
        where: {
          OR: conditions,
          NOT: { id },
        },
      });

      if (existing) {
        const field = dto.code !== undefined && existing.code === dto.code ? 'code' : 'email';
        throw new ConflictException(`Já existe uma congregação com este ${field}`);
      }
    }

    return this.prisma.client.congregation.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.city !== undefined && { city: dto.city }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.client.congregation.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async ensureCircuitExists(circuitId: string): Promise<void> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id: circuitId },
    });

    if (!circuit) {
      throw new NotFoundException('Circuito não encontrado');
    }
  }
}
