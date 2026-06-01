import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitsService } from './circuits.service';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

function buildCircuit(overrides: Partial<CircuitResponse> = {}): CircuitResponse {
  return {
    id: overrides.id ?? CIRCUIT_ID,
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
          useValue: { client: prismaMock },
        },
      ],
    }).compile();

    service = module.get(CircuitsService);
  });

  // ── findAll ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('deve retornar lista paginada de circuitos', async () => {
      const circuits = [buildCircuit()];

      prismaMock.circuit.findMany.mockResolvedValue(circuits);
      prismaMock.circuit.count.mockResolvedValue(1);

      const result = await service.findAll(1, 20, CIRCUIT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.circuit.findMany.mockResolvedValue([buildCircuit()]);
      prismaMock.circuit.count.mockResolvedValue(45);

      const result = await service.findAll(1, 20, CIRCUIT_ID);

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve filtrar por userCircuitId e aplicar paginação', async () => {
      prismaMock.circuit.findMany.mockResolvedValue([]);
      prismaMock.circuit.count.mockResolvedValue(0);

      await service.findAll(3, 10, CIRCUIT_ID);

      expect(prismaMock.circuit.findMany).toHaveBeenCalledWith({
        where: { id: CIRCUIT_ID },
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

      const result = await service.create(CIRCUIT_ID, dto);

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.create).toHaveBeenCalledWith({
        data: {
          name: 'Circuito RJ-01',
          city: 'Rio de Janeiro',
          state: 'RJ',
        },
      });
    });

    it('deve converter o state para uppercase', async () => {
      const dto = { name: 'Circuito MG-01', city: 'Belo Horizonte', state: 'mg' };
      const expected = buildCircuit({ state: 'MG' });

      prismaMock.circuit.create.mockResolvedValue(expected);

      await service.create(CIRCUIT_ID, dto);

      expect(prismaMock.circuit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'MG' }),
        }),
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o circuito quando ele existe e pertence ao circuito do usuário', async () => {
      const expected = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(expected);

      const result = await service.findOne(expected.id, CIRCUIT_ID);

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: expected.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      const circuit = buildCircuit();
      prismaMock.circuit.findUnique.mockResolvedValue(circuit);

      await expect(service.findOne(circuit.id, 'outro-circuito')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'Circuito SP-02' });

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'Circuito SP-02' }, CIRCUIT_ID);

      expect(result.name).toBe('Circuito SP-02');
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'Circuito SP-02' },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(existing);

      const result = await service.update(existing.id, {}, CIRCUIT_ID);

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

      await service.update(existing.id, { state: 'rj' }, CIRCUIT_ID);

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

      await service.remove(existing.id, CIRCUIT_ID);

      expect(prismaMock.circuit.delete).toHaveBeenCalledWith({
        where: { id: existing.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
