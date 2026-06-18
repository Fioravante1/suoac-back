import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { EventPassengerResponse } from './interfaces/event-passenger-response.interface';
import { EventPassengersController } from './event-passengers.controller';
import { EventPassengersService } from './event-passengers.service';

interface ReplyMock {
  header: jest.Mock;
  send: jest.Mock;
}

function buildReplyMock(): ReplyMock {
  const reply: ReplyMock = {
    header: jest.fn(() => reply),
    send: jest.fn(() => reply),
  };
  return reply;
}

// ── Helpers ──────────────────────────────────────────────────────
const USER: JwtPayload = {
  sub: 'u1u2u3u4-0000-0000-0000-000000000001',
  email: 'user@test.com',
  role: 'CONGREGATION_COORDINATOR',
  circuitId: 'circuit-1',
  congregationId: 'c1c2c3c4-0000-0000-0000-000000000001',
};

function buildResponse(overrides: Partial<EventPassengerResponse> = {}): EventPassengerResponse {
  return {
    id: overrides.id ?? 'ep1ep2e3-0000-0000-0000-000000000001',
    passenger: overrides.passenger ?? { id: 'p1', name: 'João', rg: '12345678X', phone: null },
    totalAmount: overrides.totalAmount ?? '25',
    paidAmount: overrides.paidAmount ?? '0',
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    exemptionReason: overrides.exemptionReason ?? null,
    observations: overrides.observations ?? null,
    eventId: overrides.eventId ?? 'e1',
    congregationId: overrides.congregationId ?? 'c1',
    registeredById: overrides.registeredById ?? 'u1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    days: overrides.days ?? [],
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventPassengersController', () => {
  let controller: EventPassengersController;
  let serviceMock: jest.Mocked<EventPassengersService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByEvent: jest.fn(),
      exportPdf: jest.fn(),
      findOne: jest.fn(),
      updateDays: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<EventPassengersService>;

    const module = await Test.createTestingModule({
      controllers: [EventPassengersController],
      providers: [{ provide: EventPassengersService, useValue: serviceMock }],
    }).compile();

    controller = module.get(EventPassengersController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const expected = buildResponse();
      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create('event-1', USER, { passengerId: 'p1' });

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith('event-1', USER, { passengerId: 'p1' });
    });

    it('deve propagar ConflictException do service', async () => {
      serviceMock.create.mockRejectedValue(new ConflictException('Passageiro já inscrito'));

      await expect(controller.create('event-1', USER, { passengerId: 'p1' })).rejects.toThrow(ConflictException);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.create.mockRejectedValue(new UnprocessableEntityException('Evento não está OPEN'));

      await expect(controller.create('event-1', USER, { passengerId: 'p1' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve delegar DTO com payment ao service corretamente', async () => {
      const expected = buildResponse({ paymentStatus: 'PAID', paidAmount: '25' });
      serviceMock.create.mockResolvedValue(expected);

      const dto = {
        passengerId: 'p1',
        payment: { amount: 25, paidAt: '2026-05-01T10:00:00Z' },
      };

      const result = await controller.create('event-1', USER, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith('event-1', USER, dto);
    });
  });

  // ── findByEvent ────────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve delegar a listagem ao service com paginação padrão', async () => {
      const expected = {
        data: [buildResponse()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        financialSummary: {
          totalPassengers: 1,
          totalExpected: '25.00',
          totalReceived: '0.00',
          totalPending: '25.00',
          byStatus: { paid: 0, partial: 0, pending: 1, exempt: 0 },
        },
      };
      serviceMock.findByEvent.mockResolvedValue(expected);

      const query = {};
      const result = await controller.findByEvent('event-1', query, USER);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith('event-1', USER, query);
    });

    it('deve repassar o query completo (filtros) ao service', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
        financialSummary: {
          totalPassengers: 0,
          totalExpected: '0.00',
          totalReceived: '0.00',
          totalPending: '0.00',
          byStatus: { paid: 0, partial: 0, pending: 0, exempt: 0 },
        },
      };
      serviceMock.findByEvent.mockResolvedValue(expected);

      const query = {
        page: 2,
        limit: 50,
        paymentStatus: 'PENDING' as const,
        congregationId: 'cong-1',
        name: 'joão',
        eventDayIds: ['day-1', 'day-2'],
      };
      await controller.findByEvent('event-1', query, USER);

      expect(serviceMock.findByEvent).toHaveBeenCalledWith('event-1', USER, query);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findByEvent.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.findByEvent('event-1', {}, USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ────────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildResponse();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('ep-1', USER);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith('ep-1', USER);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Inscrição não encontrada'));

      await expect(controller.findOne('non-existent', USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateDays ────────────────────────────────────────────────
  describe('updateDays', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const expected = buildResponse();
      serviceMock.updateDays.mockResolvedValue(expected);

      const result = await controller.updateDays('ep-1', { dayIds: ['d1'] }, USER);

      expect(result).toEqual(expected);
      expect(serviceMock.updateDays).toHaveBeenCalledWith('ep-1', { dayIds: ['d1'] }, USER);
    });

    it('deve propagar ForbiddenException do service', async () => {
      serviceMock.updateDays.mockRejectedValue(new ForbiddenException('Sem permissão'));

      await expect(controller.updateDays('ep-1', { dayIds: ['d1'] }, USER)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove('ep-1', USER);

      expect(serviceMock.remove).toHaveBeenCalledWith('ep-1', USER);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Inscrição não encontrada'));

      await expect(controller.remove('non-existent', USER)).rejects.toThrow(NotFoundException);
    });
  });

  // ── exportPdf ──────────────────────────────────────────────────
  describe('exportPdf', () => {
    const CIRCUIT_ID = 'c0000000-0000-0000-0000-0000000000c1';
    const EVENT_ID = 'e0000000-0000-0000-0000-0000000000e1';

    it('deve delegar ao service repassando circuitId, eventId, user e dto', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockResolvedValue({ buffer: Buffer.from('%PDF-x') });

      await controller.exportPdf(
        CIRCUIT_ID,
        EVENT_ID,
        { congregationId: 'cong-1', includeSensitive: true },
        USER,
        reply as unknown as FastifyReply,
      );

      expect(serviceMock.exportPdf).toHaveBeenCalledWith(CIRCUIT_ID, EVENT_ID, USER, {
        congregationId: 'cong-1',
        includeSensitive: true,
      });
    });

    it('deve responder com Content-Type application/pdf e body Buffer', async () => {
      const reply = buildReplyMock();
      const buffer = Buffer.from('%PDF-conteudo');
      serviceMock.exportPdf.mockResolvedValue({ buffer });

      await controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply);

      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      // toHaveBeenCalledWith(buffer) garante que o body enviado é exatamente o Buffer do service
      expect(reply.send).toHaveBeenCalledWith(buffer);
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('deve usar filename apenas com eventId quando não há congregationCode', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockResolvedValue({ buffer: Buffer.from('%PDF-x') });

      await controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply);

      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="inscritos-${EVENT_ID}.pdf"`,
      );
    });

    it('deve usar o código sanitizado da congregação no filename', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockResolvedValue({ buffer: Buffer.from('%PDF-x'), congregationCode: '105/478' });

      await controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply);

      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="inscritos-105-478-${EVENT_ID}.pdf"`,
      );
    });

    it('deve propagar NotFoundException do service', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(
        controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve propagar ForbiddenException do service', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockRejectedValue(new ForbiddenException('Sem permissão'));

      await expect(
        controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      const reply = buildReplyMock();
      serviceMock.exportPdf.mockRejectedValue(new UnprocessableEntityException('Excede o teto'));

      await expect(
        controller.exportPdf(CIRCUIT_ID, EVENT_ID, {}, USER, reply as unknown as FastifyReply),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
