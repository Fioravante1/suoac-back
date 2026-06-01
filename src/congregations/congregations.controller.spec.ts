import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CongregationsController } from './congregations.controller';
import { CongregationsService } from './congregations.service';
import type { CongregationResponse } from './interfaces/congregation-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
function buildCongregation(overrides: Partial<CongregationResponse> = {}): CongregationResponse {
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

const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

// ── Test Suite ───────────────────────────────────────────────────
describe('CongregationsController', () => {
  let controller: CongregationsController;
  let serviceMock: jest.Mocked<CongregationsService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByCircuit: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CongregationsService>;

    const module = await Test.createTestingModule({
      controllers: [CongregationsController],
      providers: [{ provide: CongregationsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(CongregationsController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';

    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const dto = { code: '80275', name: 'Águas de Março', email: 'CONG09480275@jwpub.org' };
      const expected = buildCongregation();

      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create(circuitId, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(circuitId, dto);
    });

    it('deve propagar NotFoundException do service', async () => {
      const dto = { code: '80275', name: 'Águas de Março', email: 'CONG09480275@jwpub.org' };

      serviceMock.create.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.create(circuitId, dto)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException do service', async () => {
      const dto = { code: '80275', name: 'Águas de Março', email: 'CONG09480275@jwpub.org' };

      serviceMock.create.mockRejectedValue(new ConflictException('Já existe uma congregação com este código'));

      await expect(controller.create(circuitId, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';

    it('deve delegar a listagem ao service com paginação padrão', async () => {
      const expected = {
        data: [buildCongregation()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(circuitId, {});

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(circuitId, 1, 20);
    });

    it('deve passar parâmetros de paginação customizados', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
      };

      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(circuitId, { page: 2, limit: 10 });

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(circuitId, 2, 10);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildCongregation();

      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(expected.id, CIRCUIT_ID);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(expected.id, CIRCUIT_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Congregação não encontrada'));

      await expect(controller.findOne('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const existing = buildCongregation();
      const updated = buildCongregation({ name: 'Novo Nome' });

      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(existing.id, { name: 'Novo Nome' }, CIRCUIT_ID);

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(existing.id, { name: 'Novo Nome' }, CIRCUIT_ID);
    });

    it('deve propagar ConflictException do service', async () => {
      serviceMock.update.mockRejectedValue(new ConflictException('Já existe uma congregação com este código'));

      await expect(controller.update('id', { code: 'duplicado' }, CIRCUIT_ID)).rejects.toThrow(ConflictException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove('c1c2c3c4-0000-0000-0000-000000000001', CIRCUIT_ID);

      expect(serviceMock.remove).toHaveBeenCalledWith('c1c2c3c4-0000-0000-0000-000000000001', CIRCUIT_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Congregação não encontrada'));

      await expect(controller.remove('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
