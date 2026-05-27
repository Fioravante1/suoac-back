import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EncryptionService } from '../common/encryption/encryption.service';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePassengerDto } from './dto/create-passenger.dto';
import type { UpdatePassengerDto } from './dto/update-passenger.dto';
import type { PassengerResponse } from './interfaces/passenger-response.interface';

const RG_PATTERN = /^[\d.\-xX]{5,14}$/;

@Injectable()
export class PassengersService {
  private readonly logger = new Logger(PassengersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(congregationId: string, dto: CreatePassengerDto): Promise<PassengerResponse> {
    await this.ensureCongregationExists(congregationId);

    const normalizedRg = this.normalizeRg(dto.rg);
    const rgHash = this.encryption.hash(normalizedRg);

    const existing = await this.prisma.client.passenger.findUnique({
      where: { congregationId_rgHash: { congregationId, rgHash } },
    });

    if (existing) {
      this.logger.warn(`Conflito ao criar passageiro — RG duplicado na congregação, congregationId=${congregationId}`);
      throw new ConflictException('Já existe um passageiro com este RG nesta congregação');
    }

    const rgEncrypted = this.encryption.encrypt(normalizedRg);

    const passenger = await this.prisma.client.passenger.create({
      data: {
        name: dto.name,
        rgEncrypted,
        rgHash,
        phone: dto.phone,
        observations: dto.observations,
        congregationId,
      },
    });

    this.logger.log(`Passageiro criado — id=${passenger.id}, congregationId=${congregationId}`);
    return this.toResponse(passenger);
  }

  async findByCongregation(
    congregationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<PassengerResponse>> {
    await this.ensureCongregationExists(congregationId);

    this.logger.debug(`Listando passageiros — congregationId=${congregationId}, page=${page}, limit=${limit}`);

    const where = { congregationId };

    const [data, total] = await Promise.all([
      this.prisma.client.passenger.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.passenger.count({ where }),
    ]);

    return {
      data: data.map((p) => this.toResponse(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async search(
    congregationId: string,
    q: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<PassengerResponse>> {
    await this.ensureCongregationExists(congregationId);

    this.logger.debug(`Buscando passageiros — congregationId=${congregationId}, q="${q}"`);

    const isRgQuery = RG_PATTERN.test(q);

    if (isRgQuery) {
      const normalizedRg = this.normalizeRg(q);
      const rgHash = this.encryption.hash(normalizedRg);

      const passenger = await this.prisma.client.passenger.findUnique({
        where: { congregationId_rgHash: { congregationId, rgHash } },
      });

      const data = passenger ? [this.toResponse(passenger)] : [];
      return {
        data,
        meta: {
          total: data.length,
          page: 1,
          limit,
          totalPages: data.length > 0 ? 1 : 0,
        },
      };
    }

    const where = {
      congregationId,
      name: { contains: q, mode: 'insensitive' as const },
    };

    const [data, total] = await Promise.all([
      this.prisma.client.passenger.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.passenger.count({ where }),
    ]);

    return {
      data: data.map((p) => this.toResponse(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PassengerResponse> {
    const passenger = await this.prisma.client.passenger.findUnique({
      where: { id },
    });

    if (!passenger) {
      this.logger.warn(`Passageiro não encontrado — id=${id}`);
      throw new NotFoundException('Passageiro não encontrado');
    }

    return this.toResponse(passenger);
  }

  async update(id: string, dto: UpdatePassengerDto): Promise<PassengerResponse> {
    const existing = await this.prisma.client.passenger.findUnique({
      where: { id },
    });

    if (!existing) {
      this.logger.warn(`Passageiro não encontrado para atualização — id=${id}`);
      throw new NotFoundException('Passageiro não encontrado');
    }

    let rgEncrypted: string | undefined;
    let rgHash: string | undefined;

    if (dto.rg !== undefined) {
      const normalizedRg = this.normalizeRg(dto.rg);
      rgHash = this.encryption.hash(normalizedRg);

      if (rgHash !== existing.rgHash) {
        const conflict = await this.prisma.client.passenger.findUnique({
          where: { congregationId_rgHash: { congregationId: existing.congregationId, rgHash } },
        });

        if (conflict) {
          this.logger.warn(`Conflito ao atualizar passageiro — RG duplicado, id=${id}`);
          throw new ConflictException('Já existe um passageiro com este RG nesta congregação');
        }
      }

      rgEncrypted = this.encryption.encrypt(normalizedRg);
    }

    const passenger = await this.prisma.client.passenger.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(rgEncrypted !== undefined && { rgEncrypted }),
        ...(rgHash !== undefined && { rgHash }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.observations !== undefined && { observations: dto.observations }),
      },
    });

    this.logger.log(`Passageiro atualizado — id=${id}`);
    return this.toResponse(passenger);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.passenger.findUnique({
      where: { id },
    });

    if (!existing) {
      this.logger.warn(`Passageiro não encontrado para remoção — id=${id}`);
      throw new NotFoundException('Passageiro não encontrado');
    }

    const eventCount = await this.prisma.client.eventPassenger.count({
      where: { passengerId: id },
    });

    if (eventCount > 0) {
      this.logger.warn(
        `Tentativa de remover passageiro com inscrições em eventos — id=${id}, eventCount=${eventCount}`,
      );
      throw new UnprocessableEntityException('Não é possível remover um passageiro que possui inscrições em eventos');
    }

    await this.prisma.client.passenger.delete({
      where: { id },
    });

    this.logger.warn(`Passageiro removido (hard-delete) — id=${id}`);
  }

  private normalizeRg(rg: string): string {
    return rg.replace(/[.-]/g, '').toUpperCase();
  }

  private toResponse(passenger: {
    id: string;
    name: string;
    rgEncrypted: string;
    phone: string | null;
    observations: string | null;
    congregationId: string;
    createdAt: Date;
    updatedAt: Date;
  }): PassengerResponse {
    return {
      id: passenger.id,
      name: passenger.name,
      rg: this.encryption.decrypt(passenger.rgEncrypted),
      phone: passenger.phone,
      observations: passenger.observations,
      congregationId: passenger.congregationId,
      createdAt: passenger.createdAt,
      updatedAt: passenger.updatedAt,
    };
  }

  private async ensureCongregationExists(congregationId: string): Promise<void> {
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: congregationId, isActive: true },
    });

    if (!congregation) {
      this.logger.warn(`Congregação não encontrada ao validar dependência — congregationId=${congregationId}`);
      throw new NotFoundException('Congregação não encontrada');
    }
  }
}
