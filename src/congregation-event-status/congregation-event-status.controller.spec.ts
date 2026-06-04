import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CongregationEventStatusController } from './congregation-event-status.controller';
import { CongregationEventStatusService } from './congregation-event-status.service';
import type { CongregationEventStatusResponse } from './interfaces/congregation-event-status-response.interface';

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';

function buildUser(): JwtPayload {
  return {
    sub: USER_ID,
    email: 'user@test.com',
    role: 'CIRCUIT_COORDINATOR',
    circuitId: 'circuit-1',
    congregationId: null,
  };
}

function buildStatusResponse(
  overrides: Partial<CongregationEventStatusResponse> = {},
): CongregationEventStatusResponse {
  return {
    id: overrides.id ?? null,
    status: overrides.status ?? 'PENDING',
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    congregationName: overrides.congregationName ?? 'Congregação Central',
    eventId: overrides.eventId ?? EVENT_ID,
    finalizedById: overrides.finalizedById ?? null,
    finalizedAt: overrides.finalizedAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CongregationEventStatusController', () => {
  let controller: CongregationEventStatusController;
  let serviceMock: jest.Mocked<CongregationEventStatusService>;

  beforeEach(async () => {
    serviceMock = {
      findByEvent: jest.fn(),
      updateStatus: jest.fn(),
      ensureNotFinalized: jest.fn(),
    } as unknown as jest.Mocked<CongregationEventStatusService>;

    const module = await Test.createTestingModule({
      controllers: [CongregationEventStatusController],
      providers: [{ provide: CongregationEventStatusService, useValue: serviceMock }],
    }).compile();

    controller = module.get(CongregationEventStatusController);
  });

  describe('findByEvent', () => {
    it('deve delegar para o service e retornar lista de status', async () => {
      const user = buildUser();
      const expected = [buildStatusResponse()];
      serviceMock.findByEvent.mockResolvedValue(expected);

      const result = await controller.findByEvent(EVENT_ID, user);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith(EVENT_ID, user);
    });
  });

  describe('updateStatus', () => {
    it('deve delegar para o service e retornar status atualizado', async () => {
      const user = buildUser();
      const dto = { status: 'FINALIZED' as const };
      const expected = buildStatusResponse({ status: 'FINALIZED', finalizedById: USER_ID });
      serviceMock.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus(EVENT_ID, CONGREGATION_ID, user, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.updateStatus).toHaveBeenCalledWith(EVENT_ID, CONGREGATION_ID, user, dto);
    });
  });
});
