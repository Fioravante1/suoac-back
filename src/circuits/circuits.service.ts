import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership } from '../common/authorization/circuit-ownership.util';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateCircuitDto } from './dto/update-circuit.dto';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

@Injectable()
export class CircuitsService {
  private readonly logger = new Logger(CircuitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findOwn(user: JwtPayload): Promise<CircuitResponse> {
    this.logger.debug(`Buscando circuito do usuário — circuitId=${user.circuitId}`);

    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id: user.circuitId },
    });

    if (!circuit) {
      this.logger.warn(`Circuito do usuário não encontrado — circuitId=${user.circuitId}`);
      throw new NotFoundException('Circuito não encontrado');
    }

    return circuit;
  }

  async findOne(id: string, user: JwtPayload): Promise<CircuitResponse> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id },
    });

    if (!circuit) {
      this.logger.warn(`Circuito não encontrado — id=${id}`);
      throw new NotFoundException('Circuito não encontrado');
    }

    checkCircuitOwnership(user, circuit.id);

    return circuit;
  }

  async update(id: string, dto: UpdateCircuitDto, user: JwtPayload): Promise<CircuitResponse> {
    const existing = await this.findOne(id, user);

    const circuit = await this.prisma.client.circuit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state.toUpperCase() }),
      },
    });

    this.logger.log(`Circuito atualizado — id=${id}`);

    void this.auditLogService
      .log('UPDATE', 'Circuit', id, user.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: circuit as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

    return circuit;
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const existing = await this.findOne(id, user);

    // Gravar ANTES do delete — cascade Circuit → User → AuditLog pode destruir o executor
    try {
      await this.auditLogService.log('DELETE', 'Circuit', id, user.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: null,
        actor: this.toAuditActor(user),
      });
    } catch (err: unknown) {
      this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log');
    }

    await this.prisma.client.circuit.delete({
      where: { id },
    });

    this.logger.warn(`Circuito removido (hard-delete) — id=${id}`);
  }

  private toAuditActor(user: JwtPayload): Record<string, unknown> {
    return {
      userId: user.sub,
      email: user.email,
      role: user.role,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
    };
  }
}
