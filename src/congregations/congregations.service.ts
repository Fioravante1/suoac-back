import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCongregationDto } from './dto/create-congregation.dto';
import type { UpdateCongregationDto } from './dto/update-congregation.dto';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

@Injectable()
export class CongregationsService {
  private readonly logger = new Logger(CongregationsService.name);

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
      this.logger.warn(`Conflito ao criar congregação — ${field} duplicado, circuitId=${circuitId}`);
      throw new ConflictException(`Já existe uma congregação com este ${field}`);
    }

    const congregation = await this.prisma.client.congregation.create({
      data: {
        code: dto.code,
        name: dto.name,
        email: dto.email,
        city: dto.city,
        circuitId,
      },
    });

    this.logger.log(`Congregação criada — id=${congregation.id}, code="${congregation.code}", circuitId=${circuitId}`);
    return congregation;
  }

  async findByCircuit(
    circuitId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<CongregationResponse>> {
    await this.ensureCircuitExists(circuitId);

    this.logger.debug(`Listando congregações — circuitId=${circuitId}, page=${page}, limit=${limit}`);

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
      this.logger.warn(`Congregação não encontrada — id=${id}`);
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
        this.logger.warn(`Conflito ao atualizar congregação — id=${id}, ${field} duplicado`);
        throw new ConflictException(`Já existe uma congregação com este ${field}`);
      }
    }

    const congregation = await this.prisma.client.congregation.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.city !== undefined && { city: dto.city }),
      },
    });

    this.logger.log(`Congregação atualizada — id=${id}`);
    return congregation;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.client.congregation.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Congregação desativada (soft-delete) — id=${id}`);
  }

  private async ensureCircuitExists(circuitId: string): Promise<void> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id: circuitId },
    });

    if (!circuit) {
      this.logger.warn(`Circuito não encontrado ao validar dependência — circuitId=${circuitId}`);
      throw new NotFoundException('Circuito não encontrado');
    }
  }
}
