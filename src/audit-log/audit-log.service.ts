import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction, AuditLogDetails } from './interfaces/audit-log.interface';

const SENSITIVE_KEYS = new Set([
  'passwordHash',
  'rgEncrypted',
  'rgHash',
  'rg',
  'cpf',
  'refreshTokenHash',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'pepper',
  'secret',
]);

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: AuditAction,
    entity: string,
    entityId: string,
    userId: string,
    details?: AuditLogDetails,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: this.buildCreateData(action, entity, entityId, userId, details),
    });

    this.logger.debug(`Audit log gravado — action=${action}, entity=${entity}, entityId=${entityId}, userId=${userId}`);
  }

  buildCreateData(
    action: AuditAction,
    entity: string,
    entityId: string,
    userId: string,
    details?: AuditLogDetails,
  ): Prisma.AuditLogUncheckedCreateInput {
    const sanitizedDetails = details ? this.sanitize(details) : undefined;

    return {
      action,
      entity,
      entityId,
      userId,
      ...(sanitizedDetails !== undefined && { details: sanitizedDetails }),
    };
  }

  private sanitize(details: AuditLogDetails): Prisma.InputJsonValue {
    return {
      oldValues: details.oldValues ? this.sanitizeRecord(details.oldValues) : null,
      newValues: details.newValues ? this.sanitizeRecord(details.newValues) : null,
      ...(details.actor !== undefined && { actor: this.sanitizeRecord(details.actor) }),
    };
  }

  private sanitizeRecord(record: Record<string, unknown>): Prisma.InputJsonObject {
    const sanitized: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, value] of Object.entries(record)) {
      if (SENSITIVE_KEYS.has(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      const sanitizedValue = this.sanitizeValue(value);

      if (sanitizedValue === undefined) {
        continue;
      }

      sanitized[key] = sanitizedValue;
    }

    return sanitized;
  }

  private sanitizeValue(value: unknown): Prisma.InputJsonValue | null | undefined {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item) ?? null);
    }

    if (this.hasToJson(value)) {
      return this.sanitizeValue(value.toJSON());
    }

    if (typeof value === 'object') {
      return this.sanitizeRecord(value as Record<string, unknown>);
    }

    return undefined;
  }

  private hasToJson(value: unknown): value is { toJSON: () => unknown } {
    return value !== null && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function';
  }
}
