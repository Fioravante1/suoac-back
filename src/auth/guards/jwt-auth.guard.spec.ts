import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

// ── Helpers ──────────────────────────────────────────────────────
function buildExecutionContext(overrides: { authorization?: string; isPublic?: boolean }): {
  context: ReturnType<typeof createMockContext>;
  request: { headers: { authorization?: string }; user?: JwtPayload };
} {
  const request: { headers: { authorization?: string }; user?: JwtPayload } = {
    headers: {},
  };

  if (overrides.authorization !== undefined) {
    request.headers.authorization = overrides.authorization;
  }

  const context = createMockContext(request);
  return { context, request };
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-id',
    email: 'test@example.com',
    role: 'CIRCUIT_COORDINATOR',
    circuitId: 'circuit-id',
    congregationId: null,
    ...overrides,
  };
}

function createMockContext(request: object): {
  switchToHttp: () => { getRequest: () => typeof request };
  getHandler: () => () => void;
  getClass: () => typeof Object;
} {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => () => {},
    getClass: () => Object,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtServiceMock: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let reflectorMock: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    jwtServiceMock = {
      verifyAsync: jest.fn(),
    };

    prismaMock = mockDeep<PrismaClientType>();
    prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 0 } as never);

    reflectorMock = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    const configMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') {
          return 'test-secret';
        }
        return undefined;
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configMock },
        { provide: Reflector, useValue: reflectorMock },
        { provide: PrismaService, useValue: { client: prismaMock } },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
  });

  it('deve permitir rota @Public() sem token', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const { context } = buildExecutionContext({});

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it('deve permitir e setar request.user com token valido', async () => {
    const payload: JwtPayload = {
      sub: 'user-id',
      email: 'test@example.com',
      role: 'CIRCUIT_COORDINATOR',
      circuitId: 'circuit-id',
      congregationId: null,
    };
    jwtServiceMock.verifyAsync.mockResolvedValue(payload);
    const { context, request } = buildExecutionContext({ authorization: 'Bearer valid-token' });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('deve lancar UnauthorizedException quando header Authorization ausente', async () => {
    const { context } = buildExecutionContext({});

    await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
  });

  it('deve lancar UnauthorizedException quando token invalido', async () => {
    jwtServiceMock.verifyAsync.mockRejectedValue(new Error('invalid token'));
    const { context } = buildExecutionContext({ authorization: 'Bearer invalid-token' });

    await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
  });

  it('deve lancar UnauthorizedException quando formato do header nao e Bearer', async () => {
    const { context } = buildExecutionContext({ authorization: 'Basic some-credentials' });

    await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
  });

  describe('versao de sessao', () => {
    it('deve recusar token cuja versao de sessao ficou atras da do usuario', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue(buildPayload({ sessionVersion: 1 }));
      prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 2 } as never);
      const { context } = buildExecutionContext({ authorization: 'Bearer stale-token' });

      await expect(guard.canActivate(context as never)).rejects.toThrow('Sessao encerrada. Entre novamente.');
    });

    it('deve aceitar token sem versao de sessao enquanto o usuario estiver na versao zero', async () => {
      const payload = buildPayload();
      jwtServiceMock.verifyAsync.mockResolvedValue(payload);
      prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 0 } as never);
      const { context, request } = buildExecutionContext({ authorization: 'Bearer legacy-token' });

      const result = await guard.canActivate(context as never);

      expect(result).toBe(true);
      expect(request.user).toEqual(payload);
    });

    it('deve recusar token sem versao de sessao depois de o usuario trocar de senha', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue(buildPayload());
      prismaMock.user.findUnique.mockResolvedValue({ sessionVersion: 1 } as never);
      const { context } = buildExecutionContext({ authorization: 'Bearer legacy-token' });

      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('deve recusar token de usuario que nao existe mais', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue(buildPayload());
      prismaMock.user.findUnique.mockResolvedValue(null);
      const { context } = buildExecutionContext({ authorization: 'Bearer orphan-token' });

      await expect(guard.canActivate(context as never)).rejects.toThrow(UnauthorizedException);
    });

    it('nao deve consultar o banco em rota publica', async () => {
      reflectorMock.getAllAndOverride.mockReturnValue(true);
      const { context } = buildExecutionContext({});

      await guard.canActivate(context as never);

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
