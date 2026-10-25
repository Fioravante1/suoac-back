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
const SESSION_ID = 's1s2s3s4-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────
function buildUserForAuth(
  overrides: Partial<{
    id: string;
    passwordHash: string | null;
    isActive: boolean;
    refreshTokenHash: string | null;
    mustChangePassword: boolean;
    sessionVersion: number;
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
  sessionVersion: number;
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
    sessionVersion: overrides.sessionVersion ?? 0,
    circuitId: CIRCUIT_ID,
    congregationId: CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildSession(
  overrides: Partial<{
    id: string;
    refreshTokenHash: string;
    extended: boolean;
    expiresAt: Date;
    isActive: boolean;
  }> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? SESSION_ID,
    userId: USER_ID,
    refreshTokenHash: overrides.refreshTokenHash ?? hashOf(FAKE_REFRESH_TOKEN),
    extended: overrides.extended ?? false,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastUsedAt: new Date('2026-01-01T00:00:00Z'),
    user: buildUserForAuth({ isActive: overrides.isActive }),
  };
}

function hashOf(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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
    // Padrões da tabela de sessões: sem excedente a podar, escrita aceita e transação que resolve as operações.
    prismaMock.session.findMany.mockResolvedValue([]);
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation((operations: unknown) => Promise.all(operations as Promise<unknown>[]));

    const configMock = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          JWT_SECRET: 'test-jwt-secret',
          JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
          JWT_EXPIRATION: 900,
          JWT_REFRESH_EXPIRATION: 604800,
          JWT_EXTENDED_REFRESH_EXPIRATION: 2592000,
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

    function arrangeLogin(): void {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth());
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
    }

    it('deve retornar tokens e user sem passwordHash em login bem-sucedido', async () => {
      arrangeLogin();

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
      arrangeLogin();

      await service.login(loginDto);

      expect(hashingMock.verify).toHaveBeenCalledWith(FAKE_HASH, 'Senh@123!');
    });

    it('deve abrir uma sessao nova com o hash SHA-256 do refresh token', async () => {
      arrangeLogin();

      await service.login(loginDto);

      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String) as string,
          userId: USER_ID,
          refreshTokenHash: hashOf(FAKE_REFRESH_TOKEN),
          extended: false,
          expiresAt: expect.any(Date) as Date,
        },
      });
    });

    it('deve nao mexer nas sessoes dos outros dispositivos ao entrar', async () => {
      arrangeLogin();

      await service.login(loginDto);

      // Só vencidas saem; nenhuma delas é filtrada por dispositivo.
      expect(prismaMock.session.deleteMany).not.toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });

    it('deve apagar as sessoes vencidas do usuario ao entrar', async () => {
      arrangeLogin();

      await service.login(loginDto);

      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, expiresAt: { lte: expect.any(Date) as Date } },
      });
    });

    it('deve apagar as sessoes menos usadas quando passa de 10 dispositivos', async () => {
      arrangeLogin();
      prismaMock.session.findMany.mockResolvedValue([{ id: 'velha-1' }, { id: 'velha-2' }] as never);

      await service.login(loginDto);

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { lastUsedAt: 'desc' },
        skip: 10,
        select: { id: true },
      });
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['velha-1', 'velha-2'] } } });
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────
  describe('refreshTokens', () => {
    const refreshDto = { refreshToken: FAKE_REFRESH_TOKEN };

    function arrangeRefresh(session: Record<string, unknown> = buildSession()): void {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID, sid: SESSION_ID });
      prismaMock.session.findFirst.mockResolvedValue(session as never);
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
    }

    it('deve retornar novos tokens em refresh bem-sucedido', async () => {
      arrangeRefresh();

      const result = await service.refreshTokens(refreshDto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user.id).toBe(USER_ID);
    });

    it('deve lancar UnauthorizedException quando refresh token JWT invalido', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid token'));

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve recusar refresh emitido antes das sessoes por dispositivo (sem sid)', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    });

    it('deve procurar a sessao pelo sid e pelo dono do token', async () => {
      arrangeRefresh();

      await service.refreshTokens(refreshDto);

      expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
        where: { id: SESSION_ID, userId: USER_ID },
        include: { user: true },
      });
    });

    it('deve lancar UnauthorizedException quando a sessao nao existe mais', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID, sid: SESSION_ID });
      prismaMock.session.findFirst.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando usuario esta inativo', async () => {
      arrangeRefresh(buildSession({ isActive: false }));

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando a sessao venceu', async () => {
      arrangeRefresh(buildSession({ expiresAt: new Date(Date.now() - 1000) }));

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve recusar sem apagar a sessao quando o hash nao bate (duas abas renovando juntas)', async () => {
      arrangeRefresh(buildSession({ refreshTokenHash: 'hash-diferente' }));

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
      expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    });

    it('deve dar a cada refresh token um jti proprio, para a rotacao sempre mudar o hash', async () => {
      arrangeRefresh();
      await service.refreshTokens(refreshDto);
      arrangeRefresh();
      await service.refreshTokens(refreshDto);

      const jtis = jwtServiceMock.signAsync.mock.calls
        .map(([payload]) => (payload as { jti?: string }).jti)
        .filter((jti) => jti !== undefined);
      expect(new Set(jtis).size).toBe(2);
    });

    it('deve rotacionar o hash da sessao, so se ninguem a rotacionou antes', async () => {
      arrangeRefresh();

      await service.refreshTokens(refreshDto);

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: SESSION_ID, refreshTokenHash: hashOf(FAKE_REFRESH_TOKEN) },
        data: {
          refreshTokenHash: hashOf('new-refresh-token'),
          expiresAt: expect.any(Date) as Date,
          lastUsedAt: expect.any(Date) as Date,
        },
      });
    });

    it('deve recusar quando dois refresh simultaneos disputam o mesmo token', async () => {
      arrangeRefresh();
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshTokens(refreshDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────
  describe('logout', () => {
    it('deve apagar so a sessao do dispositivo de quem saiu', async () => {
      await service.logout(USER_ID, SESSION_ID);

      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { id: SESSION_ID, userId: USER_ID } });
    });

    it('deve nao apagar sessao nenhuma com access token anterior as sessoes por dispositivo (sem sid)', async () => {
      await expect(service.logout(USER_ID)).resolves.toBeUndefined();

      expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    });

    it('deve ser idempotente quando a sessao ja nao existe', async () => {
      prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.logout(USER_ID, 'sessao-inexistente')).resolves.toBeUndefined();
    });
  });

  // ── generateTokens ────────────────────────────────────────────
  describe('generateTokens (via login)', () => {
    function arrangeLogin(): void {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth());
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
    }

    it('deve gerar access token com payload completo, incluindo o sid da sessao', async () => {
      arrangeLogin();

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        {
          sub: USER_ID,
          email: 'joao@example.com',
          role: 'CIRCUIT_COORDINATOR',
          circuitId: CIRCUIT_ID,
          congregationId: CONGREGATION_ID,
          mustChangePassword: false,
          sessionVersion: 0,
          sid: expect.any(String) as string,
        },
        { secret: 'test-jwt-secret', expiresIn: 900 },
      );
    });

    it('deve gerar refresh token com sub, sid e um jti proprio', async () => {
      arrangeLogin();

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        { sub: USER_ID, sid: expect.any(String) as string, jti: expect.any(String) as string },
        { secret: 'test-jwt-refresh-secret', expiresIn: 604800 },
      );
    });

    it('deve usar o mesmo sid no access token, no refresh token e na linha da sessao', async () => {
      arrangeLogin();

      await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      const [accessPayload] = jwtServiceMock.signAsync.mock.calls[0]!;
      const [refreshPayload] = jwtServiceMock.signAsync.mock.calls[1]!;
      const created = prismaMock.session.create.mock.calls[0]![0] as { data: { id: string } };
      expect((accessPayload as { sid: string }).sid).toBe(created.data.id);
      expect((refreshPayload as { sid: string }).sid).toBe(created.data.id);
    });
  });

  // ── sessão estendida (manter conectado) ───────────────────────
  describe('sessão estendida', () => {
    function mockLogin(): void {
      usersServiceMock.findByEmailForAuth.mockResolvedValue(buildUserForAuth());
      hashingMock.verify.mockResolvedValue(true);
      jwtServiceMock.signAsync.mockResolvedValueOnce(FAKE_ACCESS_TOKEN).mockResolvedValueOnce(FAKE_REFRESH_TOKEN);
    }

    it('deve emitir sessão padrão quando rememberMe não é enviado', async () => {
      mockLogin();

      const result = await service.login({ email: 'joao@example.com', password: 'Senh@123!' });

      expect(result.extendedSession).toBe(false);
      expect(result.refreshExpiresIn).toBe(604800);
    });

    it('deve emitir refresh token de 30 dias e gravar a sessao como estendida com rememberMe', async () => {
      mockLogin();

      const result = await service.login({ email: 'joao@example.com', password: 'Senh@123!', rememberMe: true });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        { sub: USER_ID, sid: expect.any(String) as string, jti: expect.any(String) as string },
        { secret: 'test-jwt-refresh-secret', expiresIn: 2592000 },
      );
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ extended: true }) as object,
      });
      expect(result.extendedSession).toBe(true);
      expect(result.refreshExpiresIn).toBe(2592000);
    });

    it('deve marcar o access token como estendido para a troca de senha reemitir no mesmo modo', async () => {
      mockLogin();

      await service.login({ email: 'joao@example.com', password: 'Senh@123!', rememberMe: true });

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, extended: true }),
        expect.objectContaining({ secret: 'test-jwt-secret' }),
      );
    });

    it('deve manter a sessão estendida, lida da linha da sessao, ao renovar os tokens', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID, sid: SESSION_ID });
      prismaMock.session.findFirst.mockResolvedValue(buildSession({ extended: true }) as never);
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens({ refreshToken: FAKE_REFRESH_TOKEN });

      expect(result.extendedSession).toBe(true);
      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        { sub: USER_ID, sid: SESSION_ID, jti: expect.any(String) as string },
        { secret: 'test-jwt-refresh-secret', expiresIn: 2592000 },
      );
    });

    it('deve manter a sessão padrão ao renovar uma sessao que nao e estendida', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({ sub: USER_ID, sid: SESSION_ID });
      prismaMock.session.findFirst.mockResolvedValue(buildSession() as never);
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens({ refreshToken: FAKE_REFRESH_TOKEN });

      expect(result.extendedSession).toBe(false);
      expect(result.refreshExpiresIn).toBe(604800);
    });

    it('deve manter o modo estendido ao trocar a senha', async () => {
      const user = buildUserForAuth({ mustChangePassword: true });
      prismaMock.user.findUnique.mockResolvedValue(user as never);
      hashingMock.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      hashingMock.hash.mockResolvedValue('novo-hash');
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
      prismaMock.user.update.mockResolvedValue(user as never);

      const result = await service.changePassword(
        USER_ID,
        { currentPassword: '80275@Suoac', newPassword: 'NovaSenha@123' },
        true,
      );

      expect(result.extendedSession).toBe(true);
      expect(result.refreshExpiresIn).toBe(2592000);
    });
  });

  // ── changePassword ────────────────────────────────────────────
  describe('changePassword', () => {
    const dto = { currentPassword: '80275@Suoac', newPassword: 'NovaSenha@123' };

    /**
     * O service incrementa a versão no banco e lê o valor de volta da escrita,
     * então o mock do `update` precisa devolver o usuário **já incrementado** —
     * é dele que sai a versão do token emitido.
     */
    function arrangeSuccess(overrides: { sessionVersion?: number } = {}): void {
      const sessionVersion = overrides.sessionVersion ?? 0;
      const user = buildUserForAuth({ mustChangePassword: true, sessionVersion });
      prismaMock.user.findUnique.mockResolvedValue(user as never);
      hashingMock.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // atual ok, nova != atual
      hashingMock.hash.mockResolvedValue('novo-hash');
      jwtServiceMock.signAsync.mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token');
      prismaMock.user.update.mockResolvedValue({
        ...user,
        passwordHash: 'novo-hash',
        mustChangePassword: false,
        sessionVersion: sessionVersion + 1,
      } as never);
    }

    it('deve trocar a senha, zerar a flag e retornar novos tokens', async () => {
      arrangeSuccess();

      const result = await service.changePassword(USER_ID, dto);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.user.mustChangePassword).toBe(false);
    });

    it('deve persistir novo hash e zerar a flag de troca obrigatoria', async () => {
      arrangeSuccess();

      await service.changePassword(USER_ID, dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          passwordHash: 'novo-hash',
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      });
    });

    it('deve encerrar todas as sessoes do usuario na mesma transacao e abrir uma nova', async () => {
      arrangeSuccess();

      await service.changePassword(USER_ID, dto);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prismaMock.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER_ID, refreshTokenHash: hashOf('new-refresh-token') }) as object,
      });
    });

    it('deve delegar o incremento da versao ao banco, nao calcular em memoria', async () => {
      arrangeSuccess({ sessionVersion: 7 });

      await service.changePassword(USER_ID, dto);

      // Calcular `versao + 1` em memória faria duas trocas concorrentes lerem o
      // mesmo valor e gravarem o mesmo incremento, e a segunda não revogaria a
      // sessão da primeira.
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sessionVersion: { increment: 1 } }) }),
      );
    });

    it('deve emitir o token novo com a versao que o banco devolveu, para a sessao atual sobreviver', async () => {
      arrangeSuccess({ sessionVersion: 7 });

      await service.changePassword(USER_ID, dto);

      expect(jwtServiceMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER_ID, sessionVersion: 8 }),
        { secret: 'test-jwt-secret', expiresIn: 900 },
      );
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
