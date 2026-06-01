import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import type { EventResponse } from './interfaces/event-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';
const CIRCUIT_ID = circuitId;
const userId = 'u1u2u3u4-0000-0000-0000-000000000001';
const eventId = 'e1e2e3e4-0000-0000-0000-000000000001';

function buildEvent(overrides: Partial<EventResponse> = {}): EventResponse {
  return {
    id: overrides.id ?? eventId,
    title: overrides.title ?? 'Assembleia SP 2026',
    type: overrides.type ?? 'ASSEMBLY',
    ticketPrice: overrides.ticketPrice ?? '25.00',
    status: overrides.status ?? 'DRAFT',
    registrationDeadline: new Date('2026-06-01T00:00:00Z'),
    paymentDeadline: new Date('2026-06-15T00:00:00Z'),
    venue: overrides.venue ?? 'Salão Central',
    address: overrides.address ?? 'Rua das Flores, 100',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    observations: overrides.observations ?? null,
    circuitId: overrides.circuitId ?? circuitId,
    createdById: overrides.createdById ?? userId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventsController', () => {
  let controller: EventsController;
  let serviceMock: jest.Mocked<EventsService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByCircuit: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      transitionStatus: jest.fn(),
      cancel: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<EventsService>;

    const module = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(EventsController);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    const dto = {
      title: 'Assembleia SP 2026',
      type: 'ASSEMBLY' as const,
      ticketPrice: 25,
      registrationDeadline: '2026-06-01',
      paymentDeadline: '2026-06-15',
      venue: 'Salão Central',
      address: 'Rua das Flores, 100',
      city: 'São Paulo',
      state: 'SP',
      date: '2026-07-10',
      departureTime: '06:00',
      returnTime: '18:00',
    };

    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const expected = buildEvent();
      serviceMock.create.mockResolvedValue(expected);

      const result = await controller.create(circuitId, userId, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(circuitId, userId, dto);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.create.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

      await expect(controller.create(circuitId, userId, dto as never)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.create.mockRejectedValue(new UnprocessableEntityException('endDate é obrigatório'));

      await expect(controller.create(circuitId, userId, dto as never)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    it('deve delegar a listagem ao service com paginação padrão', async () => {
      const expected = {
        data: [buildEvent()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(circuitId, {}, 'CIRCUIT_COORDINATOR');

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(circuitId, 1, 20, 'CIRCUIT_COORDINATOR');
    });

    it('deve passar parâmetros de paginação customizados', async () => {
      const expected = {
        data: [],
        meta: { total: 0, page: 2, limit: 10, totalPages: 0 },
      };
      serviceMock.findByCircuit.mockResolvedValue(expected);

      const result = await controller.findByCircuit(circuitId, { page: 2, limit: 10 }, 'CIRCUIT_COORDINATOR');

      expect(result).toEqual(expected);
      expect(serviceMock.findByCircuit).toHaveBeenCalledWith(circuitId, 2, 10, 'CIRCUIT_COORDINATOR');
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildEvent();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(eventId, 'CIRCUIT_COORDINATOR', CIRCUIT_ID);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(eventId, 'CIRCUIT_COORDINATOR', CIRCUIT_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.findOne('id-inexistente', 'CIRCUIT_COORDINATOR', CIRCUIT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve propagar ForbiddenException do service', async () => {
      serviceMock.findOne.mockRejectedValue(
        new ForbiddenException('Sem permissão para acessar recursos de outro circuito'),
      );

      await expect(controller.findOne(eventId, 'CIRCUIT_COORDINATOR', 'outro-circuito')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const updated = buildEvent({ title: 'Novo Título' });
      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(eventId, { title: 'Novo Título' }, 'CIRCUIT_COORDINATOR', CIRCUIT_ID);

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(
        eventId,
        { title: 'Novo Título' },
        'CIRCUIT_COORDINATOR',
        CIRCUIT_ID,
      );
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.update.mockRejectedValue(
        new UnprocessableEntityException('Campos não editáveis no status FINISHED: title'),
      );

      await expect(controller.update(eventId, { title: 'Teste' }, 'CIRCUIT_COORDINATOR', CIRCUIT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── transitionStatus ──────────────────────────────────────────
  describe('transitionStatus', () => {
    it('deve delegar a transição ao service e retornar o resultado', async () => {
      const updated = buildEvent({ status: 'OPEN' });
      serviceMock.transitionStatus.mockResolvedValue(updated);

      const result = await controller.transitionStatus(eventId, { status: 'OPEN' }, CIRCUIT_ID);

      expect(result).toEqual(updated);
      expect(serviceMock.transitionStatus).toHaveBeenCalledWith(eventId, { status: 'OPEN' }, CIRCUIT_ID);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.transitionStatus.mockRejectedValue(
        new UnprocessableEntityException('Transição inválida: DRAFT → CLOSED'),
      );

      await expect(controller.transitionStatus(eventId, { status: 'CLOSED' }, CIRCUIT_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── cancel ───────────────────────────────────────────────────
  describe('cancel', () => {
    it('deve delegar o cancelamento ao service e retornar o resultado', async () => {
      const expected = buildEvent({ status: 'CANCELLED' });
      serviceMock.cancel.mockResolvedValue(expected);

      const result = await controller.cancel(eventId, CIRCUIT_ID);

      expect(result).toEqual(expected);
      expect(serviceMock.cancel).toHaveBeenCalledWith(eventId, CIRCUIT_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.cancel.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.cancel('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve delegar a remoção ao service', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await controller.remove(eventId, CIRCUIT_ID);

      expect(serviceMock.remove).toHaveBeenCalledWith(eventId, CIRCUIT_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.remove.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.remove('id-inexistente', CIRCUIT_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.remove.mockRejectedValue(
        new UnprocessableEntityException('Apenas eventos em rascunho podem ser removidos'),
      );

      await expect(controller.remove(eventId, CIRCUIT_ID)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
