import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PaymentResponse } from './interfaces/payment-response.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// ── Helpers ──────────────────────────────────────────────────────
const USER: JwtPayload = {
  sub: 'u1u2u3u4-0000-0000-0000-000000000001',
  email: 'user@test.com',
  role: 'CONGREGATION_COORDINATOR',
  circuitId: 'circuit-1',
  congregationId: 'c1c2c3c4-0000-0000-0000-000000000001',
};

function buildPaymentResponse(overrides: Partial<PaymentResponse> = {}): PaymentResponse {
  return {
    id: overrides.id ?? 'pay1pay2-0000-0000-0000-000000000001',
    amount: overrides.amount ?? '25',
    paidAt: overrides.paidAt ?? new Date('2026-01-15T10:00:00Z'),
    observations: overrides.observations ?? null,
    eventPassengerId: overrides.eventPassengerId ?? 'ep1ep2e3-0000-0000-0000-000000000001',
    registeredById: overrides.registeredById ?? 'u1u2u3u4-0000-0000-0000-000000000001',
    createdAt: overrides.createdAt ?? new Date('2026-01-15T10:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('PaymentsController', () => {
  let controller: PaymentsController;
  let serviceMock: jest.Mocked<PaymentsService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByEventPassenger: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<PaymentsService>;

    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(PaymentsController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const expected = buildPaymentResponse();
      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create('ep-1', USER, { amount: 25, paidAt: '2026-01-15T10:00:00Z' });

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith('ep-1', USER, {
        amount: 25,
        paidAt: '2026-01-15T10:00:00Z',
      });
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.create.mockRejectedValue(new UnprocessableEntityException('Passageiro isento'));

      await expect(
        controller.create('ep-1', USER, { amount: 25, paidAt: '2026-01-15T10:00:00Z' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve propagar ForbiddenException do service', async () => {
      serviceMock.create.mockRejectedValue(new ForbiddenException('Sem permissão'));

      await expect(
        controller.create('ep-1', USER, { amount: 25, paidAt: '2026-01-15T10:00:00Z' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findByEventPassenger ────────────────────────────────────────
  describe('findByEventPassenger', () => {
    it('deve delegar a listagem ao service e retornar o resultado', async () => {
      const expected = [buildPaymentResponse()];
      serviceMock.findByEventPassenger.mockResolvedValue(expected);

      const result = await controller.findByEventPassenger('ep-1', USER);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEventPassenger).toHaveBeenCalledWith('ep-1', USER);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findByEventPassenger.mockRejectedValue(new NotFoundException('Inscrição não encontrada'));

      await expect(controller.findByEventPassenger('non-existent', USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove('pay-1', USER);

      expect(serviceMock.remove).toHaveBeenCalledWith('pay-1', USER);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Pagamento não encontrado'));

      await expect(controller.remove('non-existent', USER)).rejects.toThrow(NotFoundException);
    });
  });
});
