import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { UserResponse } from './interfaces/user-response.interface';

// ── Constants ────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────
function buildUserResponse(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: overrides.id ?? USER_ID,
    name: overrides.name ?? 'João Silva',
    email: overrides.email ?? 'joao@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    isActive: overrides.isActive ?? true,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}


function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('UsersController', () => {
  let controller: UsersController;
  let serviceMock: jest.Mocked<UsersService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByCircuit: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: serviceMock }],
    }).compile();

    controller = module.get(UsersController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const dto = {
      name: 'João Silva',
      email: 'joao@example.com',
      password: 'Senh@123!',
      role: 'CIRCUIT_COORDINATOR' as const,
      congregationId: CIRCUIT_ID,
    };

    it('deve delegar a criacao ao service e retornar o resultado', async () => {
      const expected = buildUserResponse();
      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create(CIRCUIT_ID, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(CIRCUIT_ID, dto);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.create.mockRejectedValue(new NotFoundException('Circuito nao encontrado'));

      await expect(controller.create(CIRCUIT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ConflictException do service', async () => {
      serviceMock.create.mockRejectedValue(new ConflictException('Ja existe um usuario com este email'));

      await expect(controller.create(CIRCUIT_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    it('deve delegar a listagem ao service com paginacao padrao', async () => {
      const expected = {
        data: [buildUserResponse()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(CIRCUIT_ID, {});

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(CIRCUIT_ID, 1, 20);
    });

    it('deve passar parametros de paginacao customizados', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
      };
      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(CIRCUIT_ID, { page: 2, limit: 10 });

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(CIRCUIT_ID, 2, 10);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildUserResponse();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(USER_ID, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(USER_ID, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Usuario nao encontrado'));

      await expect(controller.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualizacao ao service e retornar o resultado', async () => {
      const updated = buildUserResponse({ name: 'Novo Nome' });
      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(USER_ID, { name: 'Novo Nome' }, buildUser());

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(USER_ID, { name: 'Novo Nome' }, buildUser());
    });

    it('deve propagar ConflictException do service', async () => {
      serviceMock.update.mockRejectedValue(new ConflictException('Ja existe um usuario com este email'));

      await expect(controller.update(USER_ID, { email: 'dup@example.com' }, buildUser())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remocao ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove(USER_ID, buildUser());

      expect(serviceMock.remove).toHaveBeenCalledWith(USER_ID, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Usuario nao encontrado'));

      await expect(controller.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });
});
