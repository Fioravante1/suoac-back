import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PassengerResponse } from './interfaces/passenger-response.interface';
import { PassengersController } from './passengers.controller';
import { PassengersService } from './passengers.service';

// ── Helpers ──────────────────────────────────────────────────────
function buildPassenger(overrides: Partial<PassengerResponse> = {}): PassengerResponse {
  return {
    id: overrides.id ?? 'p1p2p3p4-0000-0000-0000-000000000001',
    name: overrides.name ?? 'João Silva',
    rg: overrides.rg ?? '12345678X',
    phone: overrides.phone ?? '11999999999',
    observations: overrides.observations ?? null,
    congregationId: overrides.congregationId ?? 'c1c2c3c4-0000-0000-0000-000000000001',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';


function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? 'u1u2u3u4-0000-0000-0000-000000000001',
    email: overrides.email ?? 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('PassengersController', () => {
  let controller: PassengersController;
  let serviceMock: jest.Mocked<PassengersService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByCongregation: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<PassengersService>;

    const module = await Test.createTestingModule({
      controllers: [PassengersController],
      providers: [{ provide: PassengersService, useValue: serviceMock }],
    }).compile();

    controller = module.get(PassengersController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const congregationId = 'c1c2c3c4-0000-0000-0000-000000000001';

    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const dto = { name: 'João Silva', rg: '12.345.678-X', phone: '11999999999' };
      const expected = buildPassenger();

      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create(congregationId, buildUser(), dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(congregationId, dto, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      const dto = { name: 'João Silva', rg: '12.345.678-X' };

      serviceMock.create.mockRejectedValue(new NotFoundException('Congregação não encontrada'));

      await expect(controller.create(congregationId, buildUser(), dto)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException do service', async () => {
      const dto = { name: 'João Silva', rg: '12.345.678-X' };

      serviceMock.create.mockRejectedValue(new ConflictException('Já existe um passageiro com este RG'));

      await expect(controller.create(congregationId, buildUser(), dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByCongregation ────────────────────────────────────────
  describe('findByCongregation', () => {
    const congregationId = 'c1c2c3c4-0000-0000-0000-000000000001';

    it('deve delegar a listagem ao service com paginação padrão', async () => {
      const expected = {
        data: [buildPassenger()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      serviceMock.findByCongregation.mockResolvedValue(expected);

      const result = await controller.findByCongregation(congregationId, {}, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findByCongregation).toHaveBeenCalledWith(congregationId, 1, 20, buildUser());
    });

    it('deve passar parâmetros de paginação customizados', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
      };

      serviceMock.findByCongregation.mockResolvedValue(expected);

      const result = await controller.findByCongregation(congregationId, { page: 2, limit: 10 }, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findByCongregation).toHaveBeenCalledWith(congregationId, 2, 10, buildUser());
    });
  });

  // ── search ────────────────────────────────────────────────────
  describe('search', () => {
    const congregationId = 'c1c2c3c4-0000-0000-0000-000000000001';

    it('deve delegar a busca ao service', async () => {
      const expected = {
        data: [buildPassenger()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };

      serviceMock.search.mockResolvedValue(expected);

      const result = await controller.search(congregationId, { q: 'João' }, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.search).toHaveBeenCalledWith(congregationId, 'João', 1, 20, buildUser());
    });

    it('deve passar parâmetros de paginação customizados na busca', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
      };

      serviceMock.search.mockResolvedValue(expected);

      const result = await controller.search(congregationId, { q: 'João', page: 2, limit: 10 }, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.search).toHaveBeenCalledWith(congregationId, 'João', 2, 10, buildUser());
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildPassenger();

      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(expected.id, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(expected.id, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Passageiro não encontrado'));

      await expect(controller.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const existing = buildPassenger();
      const updated = buildPassenger({ name: 'Novo Nome' });

      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(existing.id, { name: 'Novo Nome' }, buildUser());

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(existing.id, { name: 'Novo Nome' }, buildUser());
    });

    it('deve propagar ConflictException do service', async () => {
      serviceMock.update.mockRejectedValue(new ConflictException('RG duplicado'));

      await expect(controller.update('id', { rg: '12.345.678-X' }, buildUser())).rejects.toThrow(ConflictException);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.update.mockRejectedValue(new NotFoundException('Passageiro não encontrado'));

      await expect(controller.update('id-inexistente', { name: 'Novo' }, buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove('p1p2p3p4-0000-0000-0000-000000000001', buildUser());

      expect(serviceMock.remove).toHaveBeenCalledWith('p1p2p3p4-0000-0000-0000-000000000001', buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Passageiro não encontrado'));

      await expect(controller.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.remove.mockRejectedValue(new UnprocessableEntityException('Passageiro possui inscrições em eventos'));

      await expect(controller.remove('id', buildUser())).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
