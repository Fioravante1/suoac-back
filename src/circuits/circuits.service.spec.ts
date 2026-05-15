import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitsService } from './circuits.service';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
// Factory para gerar dados de teste dinâmicos (evita fixtures estáticas)
function buildCircuit(overrides: Partial<CircuitResponse> = {}): CircuitResponse {
  return {
    id: overrides.id ?? 'a1b2c3d4-0000-0000-0000-000000000001',
    name: overrides.name ?? 'Circuito SP-01',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CircuitsService', () => {
  let service: CircuitsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [
        CircuitsService,
        {
          provide: PrismaService,
          // Simula o PrismaService com o getter `client` apontando para o mock
          useValue: { client: prismaMock },
        },
      ],
    }).compile();

    service = module.get(CircuitsService);
  });

  // ── findAll ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('deve retornar lista paginada de circuitos', async () => {
      const circuits = [buildCircuit(), buildCircuit({ id: 'a1b2c3d4-0000-0000-0000-000000000002', name: 'Circuito RJ-01' })];

      prismaMock.circuit.findMany.mockResolvedValue(circuits);
      prismaMock.circuit.count.mockResolvedValue(2);

      const result = await service.findAll(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.circuit.findMany.mockResolvedValue([buildCircuit()]);
      prismaMock.circuit.count.mockResolvedValue(45);

      const result = await service.findAll(1, 20);

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve aplicar skip e take para paginação', async () => {
      prismaMock.circuit.findMany.mockResolvedValue([]);
      prismaMock.circuit.count.mockResolvedValue(0);

      await service.findAll(3, 10);

      expect(prismaMock.circuit.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        skip: 20,
        take: 10,
      });
    });
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve criar um circuito com os dados válidos', async () => {
      const dto = { name: 'Circuito RJ-01', city: 'Rio de Janeiro', state: 'rj' };
      const expected = buildCircuit({ name: 'Circuito RJ-01', city: 'Rio de Janeiro', state: 'RJ' });

      prismaMock.circuit.create.mockResolvedValue(expected);

      const result = await service.create(dto);

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.create).toHaveBeenCalledWith({
        data: {
          name: 'Circuito RJ-01',
          city: 'Rio de Janeiro',
          state: 'RJ', // Deve converter para uppercase
        },
      });
    });

    it('deve converter o state para uppercase', async () => {
      const dto = { name: 'Circuito MG-01', city: 'Belo Horizonte', state: 'mg' };
      const expected = buildCircuit({ state: 'MG' });

      prismaMock.circuit.create.mockResolvedValue(expected);

      await service.create(dto);

      expect(prismaMock.circuit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'MG' }),
        }),
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o circuito quando ele existe', async () => {
      const expected = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(expected);

      const result = await service.findOne(expected.id);

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: expected.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'Circuito SP-02' });

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'Circuito SP-02' });

      expect(result.name).toBe('Circuito SP-02');
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'Circuito SP-02' },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' })).rejects.toThrow(NotFoundException);
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(existing);

      const result = await service.update(existing.id, {});

      expect(result).toEqual(existing);
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: {},
      });
    });

    it('deve converter state para uppercase na atualização', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ state: 'RJ' });

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      await service.update(existing.id, { state: 'rj' });

      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { state: 'RJ' },
      });
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve deletar o circuito quando ele existe', async () => {
      const existing = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.delete.mockResolvedValue(existing);

      await service.remove(existing.id);

      expect(prismaMock.circuit.delete).toHaveBeenCalledWith({
        where: { id: existing.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
