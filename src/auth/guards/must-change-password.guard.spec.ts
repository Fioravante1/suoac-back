import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ALLOW_WHILE_PASSWORD_CHANGE_KEY } from '../decorators/allow-while-password-change.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { MustChangePasswordGuard } from './must-change-password.guard';

// ── Helpers ──────────────────────────────────────────────────────
function createMockContext(user?: JwtPayload): {
  switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
  getHandler: () => () => void;
  getClass: () => typeof Object;
} {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => () => {},
    getClass: () => Object,
  };
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-id',
    email: 'test@example.com',
    role: overrides.role ?? 'CONGREGATION_COORDINATOR',
    circuitId: 'circuit-id',
    congregationId: overrides.congregationId ?? 'congregation-id',
    mustChangePassword: overrides.mustChangePassword,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('MustChangePasswordGuard', () => {
  let guard: MustChangePasswordGuard;
  let reflectorMock: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  function mockMetadata(values: { isPublic?: boolean; isAllowed?: boolean }): void {
    reflectorMock.getAllAndOverride.mockImplementation((key: unknown) => {
      if (key === IS_PUBLIC_KEY) {
        return values.isPublic;
      }
      if (key === ALLOW_WHILE_PASSWORD_CHANGE_KEY) {
        return values.isAllowed;
      }
      return undefined;
    });
  }

  beforeEach(async () => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [MustChangePasswordGuard, { provide: Reflector, useValue: reflectorMock }],
    }).compile();

    guard = module.get(MustChangePasswordGuard);
  });

  it('deve permitir rota publica mesmo com flag ativa', () => {
    mockMetadata({ isPublic: true });
    const context = createMockContext(buildPayload({ mustChangePassword: true }));

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir rota marcada com @AllowWhilePasswordChange mesmo com flag ativa', () => {
    mockMetadata({ isAllowed: true });
    const context = createMockContext(buildPayload({ mustChangePassword: true }));

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve lancar ForbiddenException quando mustChangePassword=true', () => {
    mockMetadata({});
    const context = createMockContext(buildPayload({ mustChangePassword: true }));

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('deve permitir quando mustChangePassword=false', () => {
    mockMetadata({});
    const context = createMockContext(buildPayload({ mustChangePassword: false }));

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir quando a flag esta ausente (token legado)', () => {
    mockMetadata({});
    const context = createMockContext(buildPayload());

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir quando nao ha user no request', () => {
    mockMetadata({});
    const context = createMockContext(undefined);

    expect(guard.canActivate(context as never)).toBe(true);
  });
});
