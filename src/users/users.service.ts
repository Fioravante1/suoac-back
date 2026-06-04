import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership } from '../common/authorization/circuit-ownership.util';
import { HashingService } from '../common/hashing/hashing.service';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponse } from './interfaces/user-response.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(circuitId: string, dto: CreateUserDto, caller: JwtPayload): Promise<UserResponse> {
    await this.ensureCircuitExists(circuitId);
    await this.ensureCongregationBelongsToCircuit(dto.congregationId, circuitId);
    await this.ensureEmailUnique(dto.email);

    const passwordHash = await this.hashing.hash(dto.password);

    const user = await this.prisma.client.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        circuitId,
        congregationId: dto.congregationId,
      },
    });

    this.logger.log(`Usuario criado — id=${user.id}, email="${user.email}", role=${user.role}, circuitId=${circuitId}`);

    void this.auditLogService
      .log('CREATE', 'User', user.id, caller.sub, {
        oldValues: null,
        newValues: user as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: user.id }, 'Falha ao gravar audit log'));

    return this.toUserResponse(user);
  }

  async findByCircuit(circuitId: string, page: number, limit: number): Promise<PaginatedResponse<UserResponse>> {
    await this.ensureCircuitExists(circuitId);

    this.logger.debug(`Listando usuarios — circuitId=${circuitId}, page=${page}, limit=${limit}`);

    const where = { circuitId, isActive: true };

    const [data, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      data: data.map((u) => this.toUserResponse(u)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, caller: JwtPayload): Promise<UserResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
    });

    if (!user) {
      this.logger.warn(`Usuario nao encontrado — id=${id}`);
      throw new NotFoundException('Usuario nao encontrado');
    }

    checkCircuitOwnership(caller, user.circuitId);

    return this.toUserResponse(user);
  }

  async update(id: string, dto: UpdateUserDto, caller: JwtPayload): Promise<UserResponse> {
    const existing = await this.findOneRaw(id, caller);

    if (dto.email !== undefined) {
      await this.ensureEmailUnique(dto.email, id);
    }

    if (dto.congregationId !== undefined) {
      await this.ensureCongregationBelongsToCircuit(dto.congregationId, existing.circuitId);
    }

    const passwordHash = dto.password ? await this.hashing.hash(dto.password) : undefined;

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.congregationId !== undefined && { congregationId: dto.congregationId }),
      },
    });

    this.logger.log(`Usuario atualizado — id=${id}`);

    void this.auditLogService
      .log('UPDATE', 'User', id, caller.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

    return this.toUserResponse(updated);
  }

  async remove(id: string, caller: JwtPayload): Promise<void> {
    const existing = await this.findOne(id, caller);

    const updated = await this.prisma.client.user.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`Usuario desativado (soft-delete) — id=${id}`);

    void this.auditLogService
      .log('DEACTIVATE', 'User', id, caller.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
  }

  async findByEmailForAuth(email: string): Promise<{
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    role: string;
    isActive: boolean;
    circuitId: string;
    congregationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    return this.toUserResponse(user);
  }

  // ── Private ────────────────────────────────────────────────────

  private async ensureCircuitExists(circuitId: string): Promise<void> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id: circuitId },
    });

    if (!circuit) {
      this.logger.warn(`Circuito nao encontrado ao validar dependencia — circuitId=${circuitId}`);
      throw new NotFoundException('Circuito nao encontrado');
    }
  }

  private async ensureCongregationBelongsToCircuit(congregationId: string, circuitId: string): Promise<void> {
    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id: congregationId },
    });

    if (!congregation) {
      this.logger.warn(`Congregacao nao encontrada — congregationId=${congregationId}`);
      throw new NotFoundException('Congregacao nao encontrada');
    }

    if (congregation.circuitId !== circuitId) {
      this.logger.warn(
        `Congregacao nao pertence ao circuito — congregationId=${congregationId}, circuitId=${circuitId}`,
      );
      throw new UnprocessableEntityException('Congregacao nao pertence ao circuito informado');
    }
  }

  private async ensureEmailUnique(email: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email },
    });

    if (existing && existing.id !== excludeId) {
      this.logger.warn(`Conflito ao criar/atualizar usuario — email duplicado: ${email}`);
      throw new ConflictException('Ja existe um usuario com este email');
    }
  }

  private async findOneRaw(id: string, caller: JwtPayload): Promise<User> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
    });

    if (!user) {
      this.logger.warn(`Usuario nao encontrado — id=${id}`);
      throw new NotFoundException('Usuario nao encontrado');
    }

    checkCircuitOwnership(caller, user.circuitId);

    return user;
  }

  private toUserResponse(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    circuitId: string;
    congregationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
