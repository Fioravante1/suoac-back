import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { CircuitOwnershipGuard } from './circuit-ownership.guard';

// ── Helpers ──────────────────────────────────────────────────────
function createMockContext(
  user?: JwtPayload,
  params: Record<string, string> = {},
): {
  switchToHttp: () => { getRequest: () => { user?: JwtPayload; params: Record<string, string> } };
  getHandler: () => () => void;
  getClass: () => typeof Object;
} {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
    getHandler: () => () => {},
    getClass: () => Object,
  };
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-id',
    email: 'test@example.com',
    role: 'CIRCUIT_COORDINATOR',
    circuitId: 'circuit-a',
    congregationId: null,
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CircuitOwnershipGuard', () => {
  let guard: CircuitOwnershipGuard;
  let reflectorMock: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(async () => {
    reflectorMock = {
      getAllAndOverride: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [CircuitOwnershipGuard, { provide: Reflector, useValue: reflectorMock }],
    }).compile();

    guard = module.get(CircuitOwnershipGuard);
  });

  it('deve permitir quando rota é @Public()', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext(undefined, { circuitId: 'circuit-b' });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir quando não há :circuitId nos params', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(buildPayload(), { id: 'some-id' });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve permitir quando circuitId do usuário coincide com o param', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(buildPayload({ circuitId: 'circuit-a' }), { circuitId: 'circuit-a' });

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('deve lançar ForbiddenException quando circuitId não coincide', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(buildPayload({ circuitId: 'circuit-a' }), { circuitId: 'circuit-b' });

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException quando user é null', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(undefined, { circuitId: 'circuit-b' });

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
