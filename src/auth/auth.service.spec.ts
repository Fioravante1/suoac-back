import * as crypto from 'crypto';
import { UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
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
    mustChangePassword: boolean;
  }> = {},
): {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  refreshTokenHash: string | null;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
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
    mustChangePassword: overrides.mustChangePassword ?? false,
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
  let hashingMock: jest.Mocked<Pick<HashingService, 'verify' | 'hash'>>;
  let jwtServiceMock: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let auditLogMock: jest.Mocked<Pick<AuditLogService, 'log'>>;

  beforeEach(async () => {
    usersServiceMock = {
      findByEmailForAuth: jest.fn(),
    };

    hashingMock = {
      // Default false: cobre o verify "dummy" de equalização de timing nos caminhos de falha.
      verify: jest.fn().mockResolvedValue(false),
      hash: jest.fn(),
    };

    auditLogMock = {
      log: jest.fn().mockResolvedValue(undefined),
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
        { provide: AuditLogService, useValue: auditLogMock },
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
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
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

    it('deve executar verify mesmo quando email nao existe (mitigacao de timing)', async () => {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(hashingMock.verify).toHaveBeenCalledTimes(1);
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
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login(loginDto);

      expect(hashingMock.verify).toHaveBeenCalledWith(FAKE_HASH, 'Senh@123!');
    });

    it('deve salvar hash SHA-256 do refresh token no banco', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
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
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
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
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
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
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: USER_ID,
          email: 'joao@example.com',
          role: 'CIRCUIT_COORDINATOR',
          circuitId: CIRCUIT_ID,
          congregationId: CONGREGATION_ID,
          mustChangePassword: false,
        },
        { secret: 'test-jwt-secret', expiresIn: 900 },
      );
    });

    it('deve gerar refresh token apenas com sub', async () => {
      const user = buildUserForAuth();
      usersServiceMock.findByEmailForAuth.mockResolvedValue(user);
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
      prismaMock.user.update.mockResolvedValue(user as never);

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        { sub: USER_ID },
        { secret: 'test-jwt-refresh-secret', expiresIn: 604800 },
      );
    });
  });

  // ── changePassword ────────────────────────────────────────────
  describe('changePassword', () => {
    const dto = { currentPassword: '80275@Suoac', newPassword: 'NovaSenha@123' };

    function arrangeSuccess(): void {
      const user = buildUserForAuth({ mustChangePassword: true });
      prismaMock.user.findUnique.mockResolvedValue(user as never);
      hashingMock.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // atual ok, nova != atual
      hashingMock.hash.mockResolvedValue('novo-hash');
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
      prismaMock.user.update.mockResolvedValue(user as never);
    }

    it('deve trocar a senha, zerar a flag e retornar novos tokens', async () => {
      arrangeSuccess();

      const result = await service.changePassword(USER_ID, dto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user.mustChangePassword).toBe(false);
    });

    it('deve persistir novo hash, mustChangePassword=false e refreshTokenHash', async () => {
      arrangeSuccess();

      await service.changePassword(USER_ID, dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          passwordHash: 'novo-hash',
          mustChangePassword: false,
          refreshTokenHash: expect.any(String) as string,
        },
      });
    });

    it('deve emitir access token com mustChangePassword=false no payload', async () => {
      arrangeSuccess();

      await service.changePassword(USER_ID, dto);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, mustChangePassword: false }),
        { secret: 'test-jwt-secret', expiresIn: 900 },
      );
    });

    it('deve gravar audit log de UPDATE no User', async () => {
      arrangeSuccess();

      await service.changePassword(USER_ID, dto);

      expect(auditLogMock.log).toHaveBeenCalledWith(
        'UPDATE',
        'User',
        USER_ID,
        USER_ID,
        expect.objectContaining({ newValues: { mustChangePassword: false } }),
      );
    });

    it('deve lancar UnauthorizedException quando usuario nao existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario esta inativo', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUserForAuth({ isActive: false }) as never);

      await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando senha atual incorreta', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUserForAuth() as never);
      hashingMock.verify.mockResolvedValue(false);

      await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnprocessableEntityException quando nova senha igual a atual', async () => {
      prismaMock.user.findUnique.mockResolvedValue(buildUserForAuth() as never);
      hashingMock.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(true); // atual ok, nova == atual

      await expect(service.changePassword(USER_ID, dto)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
