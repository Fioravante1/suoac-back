import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { HashingService } from '../common/hashing/hashing.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

// ── Constants ────────────────────────────────────────────────────
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'b1b2b3b4-0000-0000-0000-000000000001';
const FAKE_HASH = '$argon2id$v=19$m=65536,t=3,p=1$fakesalt$fakehash';
const FAKE_ACCESS_TOKEN = 'fake-access-token';
const FAKE_REFRESH_TOKEN = 'fake-refresh-token';

// ── Helpers ──────────────────────────────────────────────────────
function buildUserForAuth(
  overrides: Partial<{
    id: string;
    passwordHash: string | null;
    isActive: boolean;
    refreshTokenHash: string | null;
  }> = {},
): {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  refreshTokenHash: string | null;
  role: string;
  isActive: boolean;
  circuitId: string;
  congregationId: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? USER_ID,
    name: 'João Silva',
    email: 'joao@example.com',
    passwordHash: overrides.passwordHash ?? FAKE_HASH,
    refreshTokenHash: overrides.refreshTokenHash ?? null,
    role: 'CIRCUIT_COORDINATOR',
    isActive: overrides.isActive ?? true,
    circuitId: CIRCUIT_ID,
    congregationId: CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('AuthService', () => {
  let service: AuthService;
  let usersServiceMock: jest.Mocked<Pick<UsersService, 'findByEmailForAuth'>>;
  let hashingMock: jest.Mocked<Pick<HashingService, 'verify'>>;
  let jwtServiceMock: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    usersServiceMock = {
      findByEmailForAuth: jest.fn(),
    };

    hashingMock = {
      verify: jest.fn(),
    };

    jwtServiceMock = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    prismaMock = mockDeep<PrismaClientType>();

    const configMock = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          JWT_SECRET: 'test-jwt-secret',
          JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
          JWT_EXPIRATION: 900,
          JWT_REFRESH_EXPIRATION: 604800,
        };
        return values[key];
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: HashingService, useValue: hashingMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configMock },
        { provide: PrismaService, useValue: { client: prismaMock } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── login ──────────────────────────────────────────────────────
  describe('login', () => {
    const loginDto = { email: 'joao@example.com', password: 'Senh@123!' };

    it('deve retornar tokens e user sem passwordHash em login bem-sucedido', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce(FAKE_ACCESS_TOKEN)
        .mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe(FAKE_ACCESS_TOKEN);
      expect(result.refreshToken).toBe(FAKE_REFRESH_TOKEN);
      expect(result.user.id).toBe(USER_ID);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('deve lancar UnauthorizedException quando email nao existe', async () => {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario esta inativo', async () => {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth({ isActive: false }));

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando senha incorreta', async () => {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth());
      hashingMock.verify.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario nao tem passwordHash', async () => {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth({ passwordHash: null }));

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve chamar HashingService.verify com hash e senha', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce(FAKE_ACCESS_TOKEN)
        .mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login(loginDto);

      expect(hashingMock.verify).toHaveBeenCalledWith(FAKE_HASH, 'Senh@123!');
    });

    it('deve salvar hash SHA-256 do refresh token no banco', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce(FAKE_ACCESS_TOKEN)
        .mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login(loginDto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { refreshTokenHash: expect.any(String) as string },
      });

      const updateCall = prismaMock.user.update.mock.calls[0]![0];
      const savedHash = (updateCall as { data: { refreshTokenHash: string } }).data.refreshTokenHash;
      expect(savedHash).toHaveLength(64); // SHA-256 hex
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────
  describe('refreshTokens', () => {
    const refreshDto = { refreshToken: FAKE_REFRESH_TOKEN };

    it('deve retornar novos tokens em refresh bem-sucedido', async () => {
      const tokenHash = crypto.createHash('sha256').update(FAKE_REFRESH_TOKEN).digest('hex');
      const user = buildUserForAuth({ refreshTokenHash: tokenHash });

      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });
      prismaMock.user.findUnique.mockResolvedValue(user as never);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      prismaMock.user.update.mockResolvedValue(user as never);

      const result = await service.refreshTokens(refreshDto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user.id).toBe(USER_ID);
    });

    it('deve lancar UnauthorizedException quando refresh token JWT invalido', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario nao existe', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario esta inativo', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });
      prismaMock.user.findUnique.mockResolvedValue(buildUserForAuth({ isActive: false }) as never);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando hash nao bate (token reutilizado)', async () => {
      const user = buildUserForAuth({ refreshTokenHash: 'hash-diferente' });

      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });
      prismaMock.user.findUnique.mockResolvedValue(user as never);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve atualizar refreshTokenHash no banco (rotation)', async () => {
      const tokenHash = crypto.createHash('sha256').update(FAKE_REFRESH_TOKEN).digest('hex');
      const user = buildUserForAuth({ refreshTokenHash: tokenHash });

      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });
      prismaMock.user.findUnique.mockResolvedValue(user as never);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.refreshTokens(refreshDto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { refreshTokenHash: expect.any(String) as string },
      });
    });
  });

  // ── logout ─────────────────────────────────────────────────────
  describe('logout', () => {
    it('deve limpar refreshTokenHash do usuario', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

      await service.logout(USER_ID);

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { refreshTokenHash: null },
      });
    });

    it('deve nao lancar erro quando usuario nao existe (idempotente)', async () => {
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.logout('id-inexistente')).resolves.toBeUndefined();
    });
  });

  // ── generateTokens ────────────────────────────────────────────
  describe('generateTokens (via login)', () => {
    it('deve gerar access token com payload completo', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce(FAKE_ACCESS_TOKEN)
        .mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: USER_ID,
          email: 'joao@example.com',
          role: 'CIRCUIT_COORDINATOR',
          circuitId: CIRCUIT_ID,
          congregationId: CONGREGATION_ID,
        },
        { secret: 'test-jwt-secret', expiresIn: 900 },
      );
    });

    it('deve gerar refresh token apenas com sub', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync
        .mockResolvedValueOnce(FAKE_ACCESS_TOKEN)
        .mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        { sub: USER_ID },
        { secret: 'test-jwt-refresh-secret', expiresIn: 604800 },
      );
    });
  });
});
