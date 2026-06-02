import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitsService } from './circuits.service';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'u1u2u3u4-0000-0000-0000-000000000001',
    email: 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

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

  // ── findOwn ──────────────────────────────────────────────────
  describe('findOwn', () => {
    it('deve retornar o circuito do usuário', async () => {
      const expected = buildCircuit();
      prismaMock.circuit.findUnique.mockResolvedValue(expected);

      const result = await service.findOwn(buildUser());

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: CIRCUIT_ID },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOwn(buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o circuito quando ele existe e pertence ao circuito do usuário', async () => {
      const expected = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(expected);

      const result = await service.findOne(expected.id, buildUser());

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: expected.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      const circuit = buildCircuit();
      prismaMock.circuit.findUnique.mockResolvedValue(circuit);

      await expect(service.findOne(circuit.id, buildUser({ circuitId: 'outro-circuito' }))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'Circuito SP-02' });

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'Circuito SP-02' }, buildUser());

      expect(result.name).toBe('Circuito SP-02');
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'Circuito SP-02' },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(existing);

      const result = await service.update(existing.id, {}, buildUser());

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

      await service.update(existing.id, { state: 'rj' }, buildUser());

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

      await service.remove(existing.id, buildUser());

      expect(prismaMock.circuit.delete).toHaveBeenCalledWith({
        where: { id: existing.id },
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });
});
