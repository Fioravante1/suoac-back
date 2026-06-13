import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import type { AuditLogDetails } from './interfaces/audit-log.interface';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClient>();

    const module = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(AuditLogService);
  });

  describe('log', () => {
    const userId = 'user-uuid-1';
    const entityId = 'entity-uuid-1';

    it('deve gravar um audit log de CREATE', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'User', entityId, userId, {
        oldValues: null,
        newValues: { name: 'João', email: 'joao@test.com' },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CREATE',
          entity: 'User',
          entityId,
          userId,
          details: {
            oldValues: null,
            newValues: { name: 'João', email: 'joao@test.com' },
          },
        },
      });
    });

    it('deve gravar um audit log de UPDATE', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('UPDATE', 'Circuit', entityId, userId, {
        oldValues: { name: 'Circuito A' },
        newValues: { name: 'Circuito B' },
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'UPDATE',
          entity: 'Circuit',
          entityId,
          userId,
          details: {
            oldValues: { name: 'Circuito A' },
            newValues: { name: 'Circuito B' },
          },
        },
      });
    });

    it('deve gravar um audit log de DELETE', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('DELETE', 'Passenger', entityId, userId, {
        oldValues: { name: 'Maria' },
        newValues: null,
      });

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'DELETE',
          entity: 'Passenger',
          entityId,
          userId,
          details: {
            oldValues: { name: 'Maria' },
            newValues: null,
          },
        },
      });
    });

    it('deve gravar audit log sem details quando não fornecido', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'Event', entityId, userId);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CREATE',
          entity: 'Event',
          entityId,
          userId,
          details: undefined,
        },
      });
    });

    it('deve sanitizar passwordHash dos oldValues', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('UPDATE', 'User', entityId, userId, {
        oldValues: { name: 'João', passwordHash: '$argon2id$old' },
        newValues: { name: 'João', passwordHash: '$argon2id$new' },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.oldValues).toEqual({ name: 'João', passwordHash: '[REDACTED]' });
      expect(details.newValues).toEqual({ name: 'João', passwordHash: '[REDACTED]' });
    });

    it('deve sanitizar rgEncrypted e rgHash', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'Passenger', entityId, userId, {
        oldValues: null,
        newValues: { name: 'Ana', rgEncrypted: 'enc-data', rgHash: 'hash-data' },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({ name: 'Ana', rgEncrypted: '[REDACTED]', rgHash: '[REDACTED]' });
    });

    it('deve sanitizar rg e cpf', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'Passenger', entityId, userId, {
        oldValues: null,
        newValues: { name: 'Carlos', rg: '123456789', cpf: '12345678901' },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({ name: 'Carlos', rg: '[REDACTED]', cpf: '[REDACTED]' });
    });

    it('deve sanitizar refreshTokenHash, token, accessToken, refreshToken', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('UPDATE', 'User', entityId, userId, {
        oldValues: {
          refreshTokenHash: 'old-hash',
          token: 'tok',
          accessToken: 'at',
          refreshToken: 'rt',
        },
        newValues: null,
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.oldValues).toEqual({
        refreshTokenHash: '[REDACTED]',
        token: '[REDACTED]',
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
      });
    });

    it('deve sanitizar pepper e secret', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('UPDATE', 'User', entityId, userId, {
        oldValues: { pepper: 'my-pepper', secret: 'my-secret', name: 'Test' },
        newValues: null,
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.oldValues).toEqual({
        pepper: '[REDACTED]',
        secret: '[REDACTED]',
        name: 'Test',
      });
    });

    it('deve sanitizar password', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'User', entityId, userId, {
        oldValues: null,
        newValues: { name: 'Novo', password: 'senhaForte123' },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({ name: 'Novo', password: '[REDACTED]' });
    });

    it('deve sanitizar campos sensíveis em objetos aninhados', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('CREATE', 'EventPassenger', entityId, userId, {
        oldValues: null,
        newValues: {
          id: 'ep-1',
          passenger: { name: 'Ana', rgEncrypted: 'enc-data', rgHash: 'hash-data', phone: '11999' },
        },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({
        id: 'ep-1',
        passenger: { name: 'Ana', rgEncrypted: '[REDACTED]', rgHash: '[REDACTED]', phone: '11999' },
      });
    });

    it('deve sanitizar campos sensíveis em arrays de objetos', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.log('UPDATE', 'Batch', entityId, userId, {
        oldValues: null,
        newValues: {
          items: [
            { name: 'User A', passwordHash: 'hash-a' },
            { name: 'User B', passwordHash: 'hash-b' },
          ],
        },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({
        items: [
          { name: 'User A', passwordHash: '[REDACTED]' },
          { name: 'User B', passwordHash: '[REDACTED]' },
        ],
      });
    });

    it('deve serializar Date e preservar null em objetos aninhados', async () => {
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      const createdAt = new Date('2026-01-01T00:00:00Z');

      await service.log('UPDATE', 'Event', entityId, userId, {
        oldValues: null,
        newValues: {
          event: { createdAt: createdAt.toISOString(), status: null, name: 'Evento X' },
        },
      });

      const call = prismaMock.auditLog.create.mock.calls[0]![0];
      const details = call.data.details as unknown as AuditLogDetails;
      expect(details.newValues).toEqual({
        event: { createdAt: createdAt.toISOString(), status: null, name: 'Evento X' },
      });
    });
  });
});
