import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
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

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'u1u2u3u4-0000-0000-0000-000000000001',
    email: 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? 'circuit-a',
    congregationId: overrides.congregationId ?? null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CircuitsController', () => {
  let controller: CircuitsController;
  let serviceMock: jest.Mocked<CircuitsService>;

  beforeEach(async () => {
    serviceMock = {
      findOwn: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CircuitsService>;

    const module = await Test.createTestingModule({
      controllers: [CircuitsController],
      providers: [{ provide: CircuitsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(CircuitsController);
  });

  // ── findOwn ──────────────────────────────────────────────────
  describe('findOwn', () => {
    it('deve delegar a busca do circuito do usuário ao service', async () => {
      const expected = buildCircuit();
      const user = buildUser();
      serviceMock.findOwn.mockResolvedValue(expected);

      const result = await controller.findOwn(user);

      expect(result).toEqual(expected);
      expect(serviceMock.findOwn).toHaveBeenCalledWith(user);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildCircuit();
      const user = buildUser();

      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(expected.id, user);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(expected.id, user);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'Circuito SP-02' });
      const dto = { name: 'Circuito SP-02' };
      const user = buildUser();

      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(existing.id, dto, user);

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(existing.id, dto, user);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.update.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.update('id-inexistente', { name: 'Novo' }, buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      const user = buildUser();
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove('a1b2c3d4-0000-0000-0000-000000000001', user);

      expect(serviceMock.remove).toHaveBeenCalledWith('a1b2c3d4-0000-0000-0000-000000000001', user);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });
});
