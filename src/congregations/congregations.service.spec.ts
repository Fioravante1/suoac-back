import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CongregationsService } from './congregations.service';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

// ── Types ────────────────────────────────────────────────────────
interface PrismaCongregation extends CongregationResponse {
  isActive: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────
function buildPrismaCongregation(overrides: Partial<PrismaCongregation> = {}): PrismaCongregation {
  return {
    id: overrides.id ?? 'c1c2c3c4-0000-0000-0000-000000000001',
    code: overrides.code ?? '80275',
    name: overrides.name ?? 'Águas de Março',
    email: overrides.email ?? 'CONG09480275@jwpub.org',
    city: overrides.city ?? null,
    isActive: overrides.isActive ?? true,
    circuitId: overrides.circuitId ?? 'a1b2c3d4-0000-0000-0000-000000000001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildExpectedResponse(overrides: Partial<CongregationResponse> = {}): CongregationResponse {
  return {
    id: overrides.id ?? 'c1c2c3c4-0000-0000-0000-000000000001',
    code: overrides.code ?? '80275',
    name: overrides.name ?? 'Águas de Março',
    email: overrides.email ?? 'CONG09480275@jwpub.org',
    city: overrides.city ?? null,
    circuitId: overrides.circuitId ?? 'a1b2c3d4-0000-0000-0000-000000000001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildCircuit(): { id: string; name: string; city: string; state: string; createdAt: Date; updatedAt: Date } {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    name: 'SP-019 A',
    city: 'São Paulo',
    state: 'SP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

// ── Test Suite ───────────────────────────────────────────────────
describe('CongregationsService', () => {
  let service: CongregationsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [CongregationsService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(CongregationsService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';
    const dto = { code: '80275', name: 'Águas de Março', email: 'CONG09480275@jwpub.org' };

    it('deve criar uma congregação com dados válidos', async () => {
      const prismaRow = buildPrismaCongregation();

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findFirst.mockResolvedValue(null);
      prismaMock.congregation.create.mockResolvedValue(prismaRow);

      const result = await service.create(circuitId, dto);

      expect(result).toEqual(buildExpectedResponse());
      expect(result).not.toHaveProperty('isActive');
      expect(prismaMock.congregation.create).toHaveBeenCalledWith({
        data: {
          code: dto.code,
          name: dto.name,
          email: dto.email,
          city: undefined,
          circuitId,
        },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.create(circuitId, dto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException quando o code já existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findFirst.mockResolvedValue(buildPrismaCongregation());

      await expect(service.create(circuitId, dto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException quando o email já existe', async () => {
      const existingWithDifferentCode = buildPrismaCongregation({ code: '99999' });

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findFirst.mockResolvedValue(existingWithDifferentCode);

      await expect(service.create(circuitId, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';

    it('deve retornar lista paginada de congregações sem isActive', async () => {
      const prismaRows = [
        buildPrismaCongregation(),
        buildPrismaCongregation({ id: 'c1c2c3c4-0000-0000-0000-000000000002', code: '87577' }),
      ];

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findMany.mockResolvedValue(prismaRows);
      prismaMock.congregation.count.mockResolvedValue(2);

      const result = await service.findByCircuit(circuitId, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty('isActive');
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findMany.mockResolvedValue([buildPrismaCongregation()]);
      prismaMock.congregation.count.mockResolvedValue(45);

      const result = await service.findByCircuit(circuitId, 1, 20);

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findByCircuit(circuitId, 1, 20)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar a congregação sem isActive quando ela existe e está ativa', async () => {
      const prismaRow = buildPrismaCongregation();

      prismaMock.congregation.findFirst.mockResolvedValue(prismaRow);

      const result = await service.findOne(prismaRow.id, CIRCUIT_ID);

      expect(result).toEqual(buildExpectedResponse());
      expect(result).not.toHaveProperty('isActive');
      expect(prismaMock.congregation.findFirst).toHaveBeenCalledWith({
        where: { id: prismaRow.id, isActive: true },
      });
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando a congregação está inativa', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.findOne('id-inativo', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      const congregation = buildPrismaCongregation();
      prismaMock.congregation.findFirst.mockResolvedValue(congregation);

      await expect(service.findOne(congregation.id, 'outro-circuito')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildPrismaCongregation();
      const updated = buildPrismaCongregation({ name: 'Novo Nome' });

      prismaMock.congregation.findFirst.mockResolvedValue(existing);
      prismaMock.congregation.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'Novo Nome' }, CIRCUIT_ID);

      expect(result.name).toBe('Novo Nome');
      expect(result).not.toHaveProperty('isActive');
      expect(prismaMock.congregation.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'Novo Nome' },
      });
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildPrismaCongregation();

      prismaMock.congregation.findFirst.mockResolvedValue(existing);
      prismaMock.congregation.update.mockResolvedValue(existing);

      const result = await service.update(existing.id, {}, CIRCUIT_ID);

      expect(result).toEqual(buildExpectedResponse());
      expect(prismaMock.congregation.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: {},
      });
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException quando code já pertence a outra congregação', async () => {
      const existing = buildPrismaCongregation();
      const conflict = buildPrismaCongregation({ id: 'outro-id', code: '99999' });

      prismaMock.congregation.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(conflict);

      await expect(service.update(existing.id, { code: '99999' }, CIRCUIT_ID)).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException quando email já pertence a outra congregação', async () => {
      const existing = buildPrismaCongregation();
      const conflict = buildPrismaCongregation({ id: 'outro-id', email: 'outro@email.com' });

      prismaMock.congregation.findFirst.mockResolvedValueOnce(existing).mockResolvedValueOnce(conflict);

      await expect(service.update(existing.id, { email: 'outro@email.com' }, CIRCUIT_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve desativar a congregação (soft-delete)', async () => {
      const existing = buildPrismaCongregation();

      prismaMock.congregation.findFirst.mockResolvedValue(existing);
      prismaMock.congregation.update.mockResolvedValue({ ...existing, isActive: false });

      await service.remove(existing.id, CIRCUIT_ID);

      expect(prismaMock.congregation.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { isActive: false },
      });
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
