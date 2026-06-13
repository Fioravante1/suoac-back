import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { CongregationListStatus, EventStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateCongregationEventStatusDto } from './dto/update-congregation-event-status.dto';
import type { CongregationEventStatusResponse } from './interfaces/congregation-event-status-response.interface';

@Injectable()
export class CongregationEventStatusService {
  private readonly logger = new Logger(CongregationEventStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findByEvent(eventId: string, user: JwtPayload): Promise<CongregationEventStatusResponse[]> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    this.logger.debug(`Listando status de congregações — eventId=${eventId}`);

    const congregations = await this.prisma.client.congregation.findMany({
      where: { circuitId: event.circuitId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const statuses = await this.prisma.client.congregationEventStatus.findMany({
      where: { eventId },
    });

    const statusMap = new Map(statuses.map((s) => [s.congregationId, s]));

    return congregations.map((c) => {
      const status = statusMap.get(c.id);
      return this.toResponse(c, eventId, status ?? null);
    });
  }

  async updateStatus(
    eventId: string,
    congregationId: string,
    user: JwtPayload,
    dto: UpdateCongregationEventStatusDto,
  ): Promise<CongregationEventStatusResponse> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);
    this.ensureEventOpen(event.status);

    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: congregationId, circuitId: event.circuitId, isActive: true },
    });

    if (!congregation) {
      this.logger.warn(`Congregação não encontrada ou inativa — id=${congregationId}, circuitId=${event.circuitId}`);
      throw new NotFoundException('Congregação não encontrada ou não pertence a este circuito');
    }

    if (dto.status === CongregationListStatus.PENDING && !isCircuitRole(user.role)) {
      throw new ForbiddenException('Apenas coordenadores/assistentes de circuito podem reabrir listas');
    }

    if (
      dto.status === CongregationListStatus.FINALIZED &&
      !isCircuitRole(user.role) &&
      user.congregationId !== congregationId
    ) {
      throw new ForbiddenException('Sem permissão para finalizar a lista de outra congregação');
    }

    const currentStatus = await this.prisma.client.congregationEventStatus.findUnique({
      where: { congregationId_eventId: { congregationId, eventId } },
    });

    if (dto.status === CongregationListStatus.PENDING && !currentStatus) {
      this.logger.debug(
        `Lista da congregação já estava pendente — eventId=${eventId}, congregationId=${congregationId}`,
      );
      return this.toResponse(congregation, eventId, null);
    }

    if (dto.status === CongregationListStatus.PENDING) {
      await this.prisma.client.congregationEventStatus.delete({
        where: { id: currentStatus!.id },
      });

      this.logger.log(`Lista da congregação reaberta — eventId=${eventId}, congregationId=${congregationId}`);
      void this.auditLogService
        .log('UPDATE', 'CongregationEventStatus', currentStatus!.id, user.sub, {
          oldValues: currentStatus as unknown as Record<string, unknown>,
          newValues: { status: CongregationListStatus.PENDING, eventId, congregationId },
        })
        .catch((err: unknown) => this.logger.error({ err, entityId: currentStatus!.id }, 'Falha ao gravar audit log'));

      return this.toResponse(congregation, eventId, null);
    }

    const record = await this.prisma.client.congregationEventStatus.upsert({
      where: { congregationId_eventId: { congregationId, eventId } },
      update: {
        status: CongregationListStatus.FINALIZED,
        finalizedById: user.sub,
        finalizedAt: new Date(),
      },
      create: {
        congregationId,
        eventId,
        status: CongregationListStatus.FINALIZED,
        finalizedById: user.sub,
        finalizedAt: new Date(),
      },
    });

    this.logger.log(`Lista da congregação finalizada — eventId=${eventId}, congregationId=${congregationId}`);
    void this.auditLogService
      .log(currentStatus ? 'UPDATE' : 'CREATE', 'CongregationEventStatus', record.id, user.sub, {
        oldValues: currentStatus as unknown as Record<string, unknown> | null,
        newValues: record as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: record.id }, 'Falha ao gravar audit log'));

    return this.toResponse(congregation, eventId, record);
  }

  async ensureNotFinalized(eventId: string, congregationId: string, user: JwtPayload, context: string): Promise<void> {
    if (isCircuitRole(user.role)) {
      return;
    }

    const status = await this.prisma.client.congregationEventStatus.findUnique({
      where: { congregationId_eventId: { congregationId, eventId } },
    });

    if (status?.status === CongregationListStatus.FINALIZED) {
      throw new UnprocessableEntityException(
        `A lista desta congregação já foi finalizada. Não é possível alterar ${context}`,
      );
    }
  }

  private toResponse(
    congregation: { id: string; name: string },
    eventId: string,
    status: {
      id: string;
      status: string;
      finalizedById: string | null;
      finalizedAt: Date | null;
      createdAt: Date;
    } | null,
  ): CongregationEventStatusResponse {
    return {
      id: status?.id ?? null,
      status: status?.status ?? CongregationListStatus.PENDING,
      congregationId: congregation.id,
      congregationName: congregation.name,
      eventId,
      finalizedById: status?.finalizedById ?? null,
      finalizedAt: status?.finalizedAt ?? null,
      createdAt: status?.createdAt ?? new Date(),
    };
  }

  private ensureEventOpen(status: string): void {
    if (status !== EventStatus.OPEN) {
      throw new UnprocessableEntityException(
        `Operação permitida apenas para eventos com status OPEN. Status atual: ${status}`,
      );
    }
  }
}
