import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RolesGuard } from './roles.guard';

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

function buildPayload(role: string): JwtPayload {
  return {
    sub: 'user-id',
    email: 'test@example.com',
    role,
    circuitId: 'circuit-id',
    congregationId: null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflectorMock: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(async () => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: reflectorMock }],
    }).compile();

    guard = module.get(RolesGuard);
  });

  it('deve permitir quando nenhuma @Roles() definida', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(buildPayload('CIRCUIT_COORDINATOR'));

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir quando role do usuario esta na lista', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT']);
    const context = createMockContext(buildPayload('CIRCUIT_COORDINATOR'));

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve lancar ForbiddenException quando role do usuario nao esta na lista', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(['CIRCUIT_COORDINATOR']);
    const context = createMockContext(buildPayload('CONGREGATION_ASSISTANT'));

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
