import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
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
      findByEvent: jest.fn(),
      generateReceipt: jest.fn(),
      exportPayments: jest.fn(),
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

      await expect(controller.create('ep-1', USER, { amount: 25, paidAt: '2026-01-15T10:00:00Z' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve propagar ForbiddenException do service', async () => {
      serviceMock.create.mockRejectedValue(new ForbiddenException('Sem permissão'));

      await expect(controller.create('ep-1', USER, { amount: 25, paidAt: '2026-01-15T10:00:00Z' })).rejects.toThrow(
        ForbiddenException,
      );
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

  // ── findByEvent ─────────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve delegar o extrato ao service repassando query completo', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0, totalReceived: '0.00' },
      };
      serviceMock.findByEvent.mockResolvedValue(expected);

      const query = { page: 1, limit: 20, congregationId: 'c1c2c3c4-0000-0000-0000-000000000001' };
      const result = await controller.findByEvent('event-1', USER, query);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith('event-1', USER, query);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findByEvent.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.findByEvent('non-existent', USER, {})).rejects.toThrow(NotFoundException);
    });
  });

  // ── generateReceipt ─────────────────────────────────────────────
  describe('generateReceipt', () => {
    function buildReply(): FastifyReply {
      const reply = {
        header: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };
      return reply as unknown as FastifyReply;
    }

    it('deve enviar o PDF com Content-Type e filename sanitizado', async () => {
      const buffer = Buffer.from('%PDF-1.7');
      serviceMock.generateReceipt.mockResolvedValue({ buffer, congregationCode: 'CCP/01' });
      const reply = buildReply();

      await controller.generateReceipt('circuit-1', 'event-1', { congregationId: 'cong-1' }, USER, reply);

      expect(serviceMock.generateReceipt).toHaveBeenCalledWith('circuit-1', 'event-1', USER, 'cong-1');
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="recibo-CCP-01-event-1.pdf"',
      );
      expect(reply.send).toHaveBeenCalledWith(buffer);
    });

    it('deve propagar BadRequestException do service', async () => {
      serviceMock.generateReceipt.mockRejectedValue(new BadRequestException('Informe congregationId'));

      await expect(controller.generateReceipt('circuit-1', 'event-1', {}, USER, buildReply())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── exportPayments ──────────────────────────────────────────────
  describe('exportPayments', () => {
    function buildReply(): FastifyReply {
      const reply = { header: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
      return reply as unknown as FastifyReply;
    }

    it('deve enviar o arquivo com Content-Type/Disposition do resultado do service', async () => {
      const buffer = Buffer.from('PK\x03\x04');
      serviceMock.exportPayments.mockResolvedValue({
        buffer,
        filename: 'extrato-pagamentos-event-1.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const reply = buildReply();
      const query = { format: 'xlsx' as const };

      await controller.exportPayments('circuit-1', 'event-1', query, USER, reply);

      expect(serviceMock.exportPayments).toHaveBeenCalledWith('circuit-1', 'event-1', USER, query);
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="extrato-pagamentos-event-1.xlsx"',
      );
      expect(reply.send).toHaveBeenCalledWith(buffer);
    });

    it('deve propagar exceção do service', async () => {
      serviceMock.exportPayments.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.exportPayments('circuit-1', 'event-1', {}, USER, buildReply())).rejects.toThrow(
        NotFoundException,
      );
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
