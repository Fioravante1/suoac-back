import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership } from '../common/authorization/circuit-ownership.util';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCongregationDto } from './dto/create-congregation.dto';
import type { UpdateCongregationDto } from './dto/update-congregation.dto';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

@Injectable()
export class CongregationsService {
  private readonly logger = new Logger(CongregationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(circuitId: string, dto: CreateCongregationDto, user: JwtPayload): Promise<CongregationResponse> {
    await this.ensureCircuitExists(circuitId);

    const existing = await this.prisma.client.congregation.findFirst({
      where: {
        OR: [{ code: dto.code }, { email: dto.email }],
      },
    });

    if (existing) {
      const field = existing.code === dto.code ? 'código' : 'E-mail';
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

    void this.auditLogService
      .log('CREATE', 'Congregation', congregation.id, user.sub, {
        oldValues: null,
        newValues: congregation as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: congregation.id }, 'Falha ao gravar audit log'));

    return this.toResponse(congregation);
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
      data: data.map((c) => this.toResponse(c)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: JwtPayload): Promise<CongregationResponse> {
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id, isActive: true },
    });

    if (!congregation) {
      this.logger.warn(`Congregação não encontrada — id=${id}`);
      throw new NotFoundException('Congregação não encontrada');
    }

    checkCircuitOwnership(user, congregation.circuitId);

    return this.toResponse(congregation);
  }

  async update(id: string, dto: UpdateCongregationDto, user: JwtPayload): Promise<CongregationResponse> {
    const current = await this.findOne(id, user);

    const conditions: Array<{ code: string } | { email: string }> = [];

    if (dto.code !== undefined) {
      conditions.push({ code: dto.code });
    }

    if (dto.email !== undefined) {
      conditions.push({ email: dto.email });
    }

    const conflict =
      conditions.length > 0
        ? await this.prisma.client.congregation.findFirst({
            where: {
              OR: conditions,
              NOT: { id },
            },
          })
        : null;

    if (conflict) {
      const field = dto.code !== undefined && conflict.code === dto.code ? 'Código' : 'E-mail';
      this.logger.warn(`Conflito ao atualizar congregação — id=${id}, ${field} duplicado`);
      throw new ConflictException(`Já existe uma congregação com este ${field}`);
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

    void this.auditLogService
      .log('UPDATE', 'Congregation', id, user.sub, {
        oldValues: current as unknown as Record<string, unknown>,
        newValues: congregation as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

    return this.toResponse(congregation);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const existing = await this.findOne(id, user);

    const updated = await this.prisma.client.congregation.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Congregação desativada (soft-delete) — id=${id}`);

    void this.auditLogService
      .log('DEACTIVATE', 'Congregation', id, user.sub, {
        oldValues: { ...existing, isActive: true },
        newValues: { ...updated, isActive: false } as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
  }

  private toResponse(congregation: {
    id: string;
    code: string;
    name: string;
    email: string;
    city: string | null;
    circuitId: string;
    createdAt: Date;
    updatedAt: Date;
  }): CongregationResponse {
    return {
      id: congregation.id,
      code: congregation.code,
      name: congregation.name,
      email: congregation.email,
      city: congregation.city,
      circuitId: congregation.circuitId,
      createdAt: congregation.createdAt,
      updatedAt: congregation.updatedAt,
    };
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
