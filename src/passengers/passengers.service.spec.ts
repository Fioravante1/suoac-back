import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PassengerResponse } from './interfaces/passenger-response.interface';
import { PassengersService } from './passengers.service';

// ── Types ────────────────────────────────────────────────────────
interface PrismaPassenger {
  id: string;
  name: string;
  rgEncrypted: string;
  rgHash: string;
  phone: string | null;
  observations: string | null;
  congregationId: string;
  congregation: { circuitId: string };
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ──────────────────────────────────────────────────────
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const PASSENGER_ID = 'p1p2p3p4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const ENCRYPTED_RG = 'base64-encrypted-rg';
const RG_HASH = 'a'.repeat(64);
const DECRYPTED_RG = '12345678X';

function buildPrismaPassenger(overrides: Partial<PrismaPassenger> = {}): PrismaPassenger {
  return {
    id: overrides.id ?? PASSENGER_ID,
    name: overrides.name ?? 'João Silva',
    rgEncrypted: overrides.rgEncrypted ?? ENCRYPTED_RG,
    rgHash: overrides.rgHash ?? RG_HASH,
    phone: overrides.phone ?? '11999999999',
    observations: overrides.observations ?? null,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    congregation: { circuitId: CIRCUIT_ID },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildExpectedResponse(overrides: Partial<PassengerResponse> = {}): PassengerResponse {
  return {
    id: overrides.id ?? PASSENGER_ID,
    name: overrides.name ?? 'João Silva',
    rg: overrides.rg ?? DECRYPTED_RG,
    phone: overrides.phone ?? '11999999999',
    observations: overrides.observations ?? null,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildCongregation(): {
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
    id: CONGREGATION_ID,
    code: '80275',
    name: 'Águas de Março',
    email: 'CONG09480275@jwpub.org',
    city: null,
    isActive: true,
    circuitId: CIRCUIT_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

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
describe('PassengersService', () => {
  let service: PassengersService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let encryptionMock: jest.Mocked<EncryptionService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    encryptionMock = {
      encrypt: jest.fn().mockReturnValue(ENCRYPTED_RG),
      decrypt: jest.fn().mockReturnValue(DECRYPTED_RG),
      hash: jest.fn().mockReturnValue(RG_HASH),
    } as unknown as jest.Mocked<EncryptionService>;

    const module = await Test.createTestingModule({
      providers: [
        PassengersService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: EncryptionService, useValue: encryptionMock },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(PassengersService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const dto = { name: 'João Silva', rg: '12.345.678-X', phone: '11999999999' };

    it('deve criar um passageiro com dados válidos', async () => {
      const prismaRow = buildPrismaPassenger();

      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(null);
      prismaMock.passenger.create.mockResolvedValue(prismaRow);

      const result = await service.create(CONGREGATION_ID, dto, buildUser());

      expect(result).toEqual(buildExpectedResponse());
      expect(result).not.toHaveProperty('rgEncrypted');
      expect(result).not.toHaveProperty('rgHash');
      expect(encryptionMock.hash).toHaveBeenCalledWith('12345678X');
      expect(encryptionMock.encrypt).toHaveBeenCalledWith('12345678X');
    });

    it('deve normalizar o RG antes de criptografar (remover . e -)', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(null);
      prismaMock.passenger.create.mockResolvedValue(buildPrismaPassenger());

      await service.create(CONGREGATION_ID, { ...dto, rg: '12.345.678-x' }, buildUser());

      expect(encryptionMock.hash).toHaveBeenCalledWith('12345678X');
      expect(encryptionMock.encrypt).toHaveBeenCalledWith('12345678X');
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.create(CONGREGATION_ID, dto, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException quando o RG já existe na congregação', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(buildPrismaPassenger());

      await expect(service.create(CONGREGATION_ID, dto, buildUser())).rejects.toThrow(ConflictException);
    });

    it('deve salvar rgEncrypted e rgHash no banco', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(null);
      prismaMock.passenger.create.mockResolvedValue(buildPrismaPassenger());

      await service.create(CONGREGATION_ID, dto, buildUser());

      expect(prismaMock.passenger.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          rgEncrypted: ENCRYPTED_RG,
          rgHash: RG_HASH,
          phone: dto.phone,
          observations: undefined,
          congregationId: CONGREGATION_ID,
        },
      });
    });
  });

  // ── findByCongregation ────────────────────────────────────────
  describe('findByCongregation', () => {
    it('deve retornar lista paginada de passageiros sem rgEncrypted/rgHash', async () => {
      const prismaRows = [
        buildPrismaPassenger(),
        buildPrismaPassenger({ id: 'p1p2p3p4-0000-0000-0000-000000000002', name: 'Maria Santos' }),
      ];

      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findMany.mockResolvedValue(prismaRows);
      prismaMock.passenger.count.mockResolvedValue(2);

      const result = await service.findByCongregation(CONGREGATION_ID, 1, 20, buildUser());

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty('rgEncrypted');
      expect(result.data[0]).not.toHaveProperty('rgHash');
      expect(result.data[0]!.rg).toBe(DECRYPTED_RG);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findMany.mockResolvedValue([buildPrismaPassenger()]);
      prismaMock.passenger.count.mockResolvedValue(45);

      const result = await service.findByCongregation(CONGREGATION_ID, 1, 20, buildUser());

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.findByCongregation(CONGREGATION_ID, 1, 20, buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── search ────────────────────────────────────────────────────
  describe('search', () => {
    it('deve buscar por nome com ILIKE quando query não parece RG', async () => {
      const prismaRows = [buildPrismaPassenger()];

      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findMany.mockResolvedValue(prismaRows);
      prismaMock.passenger.count.mockResolvedValue(1);

      const result = await service.search(CONGREGATION_ID, 'João', 1, 20, buildUser());

      expect(result.data).toHaveLength(1);
      expect(prismaMock.passenger.findMany).toHaveBeenCalledWith({
        where: {
          congregationId: CONGREGATION_ID,
          name: { contains: 'João', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
    });

    it('deve buscar por RG (hash exato) quando query parece RG', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(buildPrismaPassenger());

      const result = await service.search(CONGREGATION_ID, '12.345.678-X', 1, 20, buildUser());

      expect(result.data).toHaveLength(1);
      expect(encryptionMock.hash).toHaveBeenCalledWith('12345678X');
      expect(prismaMock.passenger.findUnique).toHaveBeenCalledWith({
        where: { congregationId_rgHash: { congregationId: CONGREGATION_ID, rgHash: RG_HASH } },
      });
    });

    it('deve retornar lista vazia quando RG não é encontrado', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findUnique.mockResolvedValue(null);

      const result = await service.search(CONGREGATION_ID, '99999999X', 1, 20, buildUser());

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.search(CONGREGATION_ID, 'João', 1, 20, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve retornar lista vazia quando busca por nome não encontra resultados', async () => {
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.passenger.findMany.mockResolvedValue([]);
      prismaMock.passenger.count.mockResolvedValue(0);

      const result = await service.search(CONGREGATION_ID, 'NomeInexistente', 1, 20, buildUser());

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o passageiro com RG descriptografado', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue({
        ...buildPrismaPassenger(),
        congregation: { circuitId: CIRCUIT_ID },
      } as never);

      const result = await service.findOne(PASSENGER_ID, buildUser());

      expect(result).toEqual(buildExpectedResponse());
      expect(result).not.toHaveProperty('rgEncrypted');
      expect(result).not.toHaveProperty('rgHash');
      expect(encryptionMock.decrypt).toHaveBeenCalledWith(ENCRYPTED_RG);
    });

    it('deve lançar NotFoundException quando o passageiro não existe', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue({
        ...buildPrismaPassenger(),
        congregation: { circuitId: 'outro-circuito' },
      } as never);

      await expect(service.findOne(PASSENGER_ID, buildUser())).rejects.toThrow(ForbiddenException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados (sem RG)', async () => {
      const existing = { ...buildPrismaPassenger(), congregation: { circuitId: CIRCUIT_ID } };
      const updated = buildPrismaPassenger({ name: 'Novo Nome' });

      prismaMock.passenger.findUnique.mockResolvedValue(existing);
      prismaMock.passenger.update.mockResolvedValue(updated);

      const result = await service.update(PASSENGER_ID, { name: 'Novo Nome' }, buildUser());

      expect(result.name).toBe('Novo Nome');
      expect(prismaMock.passenger.update).toHaveBeenCalledWith({
        where: { id: PASSENGER_ID },
        data: { name: 'Novo Nome' },
      });
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = { ...buildPrismaPassenger(), congregation: { circuitId: CIRCUIT_ID } };

      prismaMock.passenger.findUnique.mockResolvedValue(existing);
      prismaMock.passenger.update.mockResolvedValue(buildPrismaPassenger());

      const result = await service.update(PASSENGER_ID, {}, buildUser());

      expect(result).toEqual(buildExpectedResponse());
      expect(prismaMock.passenger.update).toHaveBeenCalledWith({
        where: { id: PASSENGER_ID },
        data: {},
      });
    });

    it('deve atualizar rgEncrypted e rgHash quando RG é enviado', async () => {
      const existing = { ...buildPrismaPassenger(), congregation: { circuitId: CIRCUIT_ID } };
      const newRgHash = 'b'.repeat(64);
      const newEncrypted = 'new-encrypted-rg';

      encryptionMock.hash.mockReturnValue(newRgHash);
      encryptionMock.encrypt.mockReturnValue(newEncrypted);

      prismaMock.passenger.findUnique
        .mockResolvedValueOnce(existing) // findOne
        .mockResolvedValueOnce(null); // uniqueness check
      prismaMock.passenger.update.mockResolvedValue({
        ...existing,
        rgEncrypted: newEncrypted,
        rgHash: newRgHash,
      });

      await service.update(PASSENGER_ID, { rg: '98.765.432-Y' }, buildUser());

      expect(encryptionMock.hash).toHaveBeenCalledWith('98765432Y');
      expect(encryptionMock.encrypt).toHaveBeenCalledWith('98765432Y');
      expect(prismaMock.passenger.update).toHaveBeenCalledWith({
        where: { id: PASSENGER_ID },
        data: { rgEncrypted: newEncrypted, rgHash: newRgHash },
      });
    });

    it('deve pular verificação de unicidade quando RG não muda', async () => {
      const existing = buildPrismaPassenger();

      // hash retorna o mesmo que o existente
      encryptionMock.hash.mockReturnValue(RG_HASH);
      encryptionMock.encrypt.mockReturnValue('new-encrypted');

      prismaMock.passenger.findUnique.mockResolvedValueOnce(existing);
      prismaMock.passenger.update.mockResolvedValue({
        ...existing,
        rgEncrypted: 'new-encrypted',
      });

      await service.update(PASSENGER_ID, { rg: '12.345.678-X' }, buildUser());

      // findUnique chamado apenas 1 vez (findOne do existing), não para verificar unicidade
      expect(prismaMock.passenger.findUnique).toHaveBeenCalledTimes(1);
    });

    it('deve lançar NotFoundException quando o passageiro não existe', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ConflictException quando novo RG já pertence a outro passageiro', async () => {
      const existing = buildPrismaPassenger();
      const conflict = buildPrismaPassenger({ id: 'outro-id' });
      const newRgHash = 'b'.repeat(64);

      encryptionMock.hash.mockReturnValue(newRgHash);

      prismaMock.passenger.findUnique
        .mockResolvedValueOnce(existing) // findOne
        .mockResolvedValueOnce(conflict); // uniqueness check

      await expect(service.update(PASSENGER_ID, { rg: '98.765.432-Y' }, buildUser())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve remover o passageiro (hard-delete) quando não tem inscrições', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue(buildPrismaPassenger());
      prismaMock.eventPassenger.count.mockResolvedValue(0);

      await service.remove(PASSENGER_ID, buildUser());

      expect(prismaMock.passenger.delete).toHaveBeenCalledWith({
        where: { id: PASSENGER_ID },
      });
    });

    it('deve lançar NotFoundException quando o passageiro não existe', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar UnprocessableEntityException quando passageiro tem inscrições em eventos', async () => {
      prismaMock.passenger.findUnique.mockResolvedValue(buildPrismaPassenger());
      prismaMock.eventPassenger.count.mockResolvedValue(2);

      await expect(service.remove(PASSENGER_ID, buildUser())).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
