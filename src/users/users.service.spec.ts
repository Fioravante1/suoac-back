import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HashingService } from '../common/hashing/hashing.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import type { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { UserResponse } from './interfaces/user-response.interface';
import { UsersService } from './users.service';

// ── Constants ────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'b1b2b3b4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const FAKE_HASH = '$argon2id$v=19$m=65536,t=3,p=1$fakesalt$fakehash';

// ── Helpers ──────────────────────────────────────────────────────
function buildCircuit(): { id: string; name: string; city: string; state: string; createdAt: Date; updatedAt: Date } {
  return {
    id: CIRCUIT_ID,
    name: 'SP-019 A',
    city: 'São Paulo',
    state: 'SP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildCongregation(overrides: Partial<{ id: string; circuitId: string }> = {}): {
  id: string;
  code: string;
  name: string;
  email: string;
  city: string | null;
  isActive: boolean;
  circuitId: string;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? CONGREGATION_ID,
    code: '80275',
    name: 'Águas de Março',
    email: 'CONG09480275@jwpub.org',
    city: null,
    isActive: true,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildUserRaw(
  overrides: Partial<{
    id: string;
    name: string;
    email: string;
    passwordHash: string | null;
    refreshTokenHash: string | null;
    role: UserRole;
    isActive: boolean;
    mustChangePassword: boolean;
    circuitId: string;
    congregationId: string | null;
  }> = {},
): {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  refreshTokenHash: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  circuitId: string;
  congregationId: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? USER_ID,
    name: overrides.name ?? 'João Silva',
    email: overrides.email ?? 'joao@example.com',
    passwordHash: overrides.passwordHash ?? FAKE_HASH,
    refreshTokenHash: overrides.refreshTokenHash ?? null,
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    isActive: overrides.isActive ?? true,
    mustChangePassword: overrides.mustChangePassword ?? false,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildUserResponse(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: overrides.id ?? USER_ID,
    name: overrides.name ?? 'João Silva',
    email: overrides.email ?? 'joao@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    isActive: overrides.isActive ?? true,
    mustChangePassword: overrides.mustChangePassword ?? false,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildCaller(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'coordenador@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let hashingMock: jest.Mocked<HashingService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    hashingMock = {
      hash: jest.fn().mockResolvedValue(FAKE_HASH),
      verify: jest.fn().mockResolvedValue(true),
      needsRehash: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<HashingService>;

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: HashingService, useValue: hashingMock },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const baseDto = {
      name: 'João Silva',
      email: 'joao@example.com',
      password: 'Senh@123!',
      role: 'CIRCUIT_COORDINATOR' as const,
      congregationId: CONGREGATION_ID,
    };

    it('deve criar um usuario com dados validos', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation());
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(buildUserRaw());

      const result = await service.create(CIRCUIT_ID, baseDto, buildCaller());

      expect(result).toEqual(buildUserResponse());
      expect(result).not.toHaveProperty('passwordHash');
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          name: baseDto.name,
          email: baseDto.email,
          passwordHash: FAKE_HASH,
          role: baseDto.role,
          circuitId: CIRCUIT_ID,
          congregationId: CONGREGATION_ID,
          mustChangePassword: true,
        },
      });
    });

    it('deve chamar HashingService.hash com a senha', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation());
      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.user.create.mockResolvedValue(buildUserRaw());

      await service.create(CIRCUIT_ID, baseDto, buildCaller());

      expect(hashingMock.hash).toHaveBeenCalledWith('Senh@123!');
    });

    it('deve lancar NotFoundException quando circuito nao existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.create(CIRCUIT_ID, baseDto, buildCaller())).rejects.toThrow(NotFoundException);
    });

    it('deve lancar ConflictException quando email ja existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation());
      prismaMock.user.findUnique.mockResolvedValue(buildUserRaw());

      await expect(service.create(CIRCUIT_ID, baseDto, buildCaller())).rejects.toThrow(ConflictException);
    });

    it('deve lancar NotFoundException quando congregationId inexistente', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findUnique.mockResolvedValue(null);

      await expect(service.create(CIRCUIT_ID, baseDto, buildCaller())).rejects.toThrow(NotFoundException);
    });

    it('deve lancar UnprocessableEntityException quando congregacao nao pertence ao circuito', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation({ circuitId: 'outro-circuito-id' }));

      await expect(service.create(CIRCUIT_ID, baseDto, buildCaller())).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    it('deve retornar lista paginada de usuarios', async () => {
      const users = [buildUserRaw(), buildUserRaw({ id: 'u2', email: 'maria@example.com' })];

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.user.findMany.mockResolvedValue(users);
      prismaMock.user.count.mockResolvedValue(2);

      const result = await service.findByCircuit(CIRCUIT_ID, buildCaller(), 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('deve lancar ForbiddenException quando o circuito do path difere do circuito do token', async () => {
      const callerDeOutroCircuito = buildCaller({ circuitId: 'b2c3d4e5-9999-9999-9999-999999999999' });

      await expect(service.findByCircuit(CIRCUIT_ID, callerDeOutroCircuito, 1, 20)).rejects.toThrow(ForbiddenException);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.user.findMany.mockResolvedValue([buildUserRaw()]);
      prismaMock.user.count.mockResolvedValue(45);

      const result = await service.findByCircuit(CIRCUIT_ID, buildCaller(), 1, 20);

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve lancar NotFoundException quando circuito nao existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findByCircuit(CIRCUIT_ID, buildCaller(), 1, 20)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar usuario sem passwordHash', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUserRaw());

      const result = await service.findOne(USER_ID, buildCaller());

      expect(result).toEqual(buildUserResponse());
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('deve lancar NotFoundException quando usuario nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', buildCaller())).rejects.toThrow(NotFoundException);
    });

    it('deve lancar ForbiddenException quando circuitId do usuario nao coincide', async () => {
      const user = buildUserRaw();
      prismaMock.user.findUnique.mockResolvedValue(user);

      await expect(service.findOne(user.id, buildCaller({ circuitId: 'outro-circuito' }))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildUserRaw();
      const updated = buildUserRaw({ name: 'Novo Nome' });

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue(updated);

      const result = await service.update(USER_ID, { name: 'Novo Nome' }, buildCaller());

      expect(result.name).toBe('Novo Nome');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { name: 'Novo Nome' },
      });
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildUserRaw();

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue(existing);

      const result = await service.update(USER_ID, {}, buildCaller());

      expect(result).toEqual(buildUserResponse());
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {},
      });
    });

    it('deve hashear nova senha quando enviada', async () => {
      const existing = buildUserRaw();
      const updated = buildUserRaw();

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue(updated);

      await service.update(USER_ID, { password: 'NovaSenha@123' }, buildCaller());

      expect(hashingMock.hash).toHaveBeenCalledWith('NovaSenha@123');
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passwordHash: FAKE_HASH, mustChangePassword: true, refreshTokenHash: null },
      });
    });

    it('deve forcar troca de senha e invalidar sessoes ao resetar senha (admin)', async () => {
      const existing = buildUserRaw();

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue(buildUserRaw({ mustChangePassword: true }));

      await service.update(USER_ID, { password: 'NovaSenha@123' }, buildCaller());

      const updateData = (prismaMock.user.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(updateData.mustChangePassword).toBe(true);
      expect(updateData.refreshTokenHash).toBeNull();
    });

    it('nao deve alterar mustChangePassword nem refreshTokenHash quando update sem senha', async () => {
      const existing = buildUserRaw();
      const updated = buildUserRaw({ name: 'Novo Nome' });

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue(updated);

      await service.update(USER_ID, { name: 'Novo Nome' }, buildCaller());

      const updateData = (prismaMock.user.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
      expect(updateData).not.toHaveProperty('mustChangePassword');
      expect(updateData).not.toHaveProperty('refreshTokenHash');
    });

    it('deve validar congregacao ao atualizar congregationId', async () => {
      const existing = buildUserRaw();
      const newCongId = 'c2c2c2c2-0000-0000-0000-000000000002';
      const updated = buildUserRaw({ congregationId: newCongId });

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation({ id: newCongId }));
      prismaMock.user.update.mockResolvedValue(updated);

      const result = await service.update(USER_ID, { congregationId: newCongId }, buildCaller());

      expect(result.congregationId).toBe(newCongId);
    });

    it('deve lancar NotFoundException quando usuario nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, buildCaller())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lancar ConflictException quando email duplicado', async () => {
      const existing = buildUserRaw();
      const conflict = buildUserRaw({ id: 'outro-id', email: 'outro@example.com' });

      // findOneRaw
      prismaMock.user.findUnique.mockResolvedValueOnce(existing);
      // ensureEmailUnique
      prismaMock.user.findUnique.mockResolvedValueOnce(conflict);

      await expect(service.update(USER_ID, { email: 'outro@example.com' }, buildCaller())).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lancar UnprocessableEntityException quando congregacao nao pertence ao circuito', async () => {
      const existing = buildUserRaw();

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.congregation.findUnique.mockResolvedValue(buildCongregation({ circuitId: 'outro-circuito' }));

      await expect(service.update(USER_ID, { congregationId: CONGREGATION_ID }, buildCaller())).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve atualizar campos mesclados (nome + email)', async () => {
      const existing = buildUserRaw();
      const updated = buildUserRaw({ name: 'Novo Nome', email: 'novo@example.com' });

      // findOneRaw
      prismaMock.user.findUnique.mockResolvedValueOnce(existing);
      // ensureEmailUnique
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      // update
      prismaMock.user.update.mockResolvedValue(updated);

      const result = await service.update(USER_ID, { name: 'Novo Nome', email: 'novo@example.com' }, buildCaller());

      expect(result.name).toBe('Novo Nome');
      expect(result.email).toBe('novo@example.com');
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve desativar o usuario (soft-delete)', async () => {
      const existing = buildUserRaw();

      prismaMock.user.findUnique.mockResolvedValue(existing);
      prismaMock.user.update.mockResolvedValue({ ...existing, isActive: false });

      await service.remove(USER_ID, buildCaller());

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isActive: false },
      });
    });

    it('deve lancar NotFoundException quando usuario nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', buildCaller())).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByEmailForAuth ───────────────────────────────────────
  describe('findByEmailForAuth', () => {
    it('deve retornar usuario com passwordHash quando existe', async () => {
      const raw = buildUserRaw();
      prismaMock.user.findUnique.mockResolvedValue(raw);

      const result = await service.findByEmailForAuth('joao@example.com');

      expect(result).not.toBeNull();
      expect(result!.passwordHash).toBe(FAKE_HASH);
      expect(result!.id).toBe(USER_ID);
      expect(result!.email).toBe('joao@example.com');
    });

    it('deve retornar null quando nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmailForAuth('naoexiste@example.com');

      expect(result).toBeNull();
    });
  });

  // ── findByEmail ───────────────────────────────────────────────
  describe('findByEmail', () => {
    it('deve retornar usuario quando existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUserRaw());

      const result = await service.findByEmail('joao@example.com');

      expect(result).toEqual(buildUserResponse());
    });

    it('deve retornar null quando nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('naoexiste@example.com');

      expect(result).toBeNull();
    });
  });
});
