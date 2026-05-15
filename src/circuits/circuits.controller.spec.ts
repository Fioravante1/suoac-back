import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CircuitsController } from './circuits.controller';
import { CircuitsService } from './circuits.service';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
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
describe('CircuitsController', () => {
  let controller: CircuitsController;
  let serviceMock: jest.Mocked<CircuitsService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<CircuitsService>;

    const module = await Test.createTestingModule({
      controllers: [CircuitsController],
      providers: [{ provide: CircuitsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(CircuitsController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const dto = { name: 'Circuito RJ-01', city: 'Rio de Janeiro', state: 'rj' };
      const expected = buildCircuit({ name: 'Circuito RJ-01', city: 'Rio de Janeiro', state: 'RJ' });

      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create(dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildCircuit();

      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(expected.id);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(expected.id);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.findOne('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'Circuito SP-02' });
      const dto = { name: 'Circuito SP-02' };

      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(existing.id, dto);

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(existing.id, dto);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.update.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.update('id-inexistente', { name: 'Novo' })).rejects.toThrow(NotFoundException);
    });
  });
});
