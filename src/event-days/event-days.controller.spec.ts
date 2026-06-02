import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { EventDaysController } from './event-days.controller';
import { EventDaysService } from './event-days.service';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const eventId = 'e1e2e3e4-0000-0000-0000-000000000001';
const dayId = 'd1d2d3d4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'circuit-a';

function buildDay(overrides: Partial<EventDayResponse> = {}): EventDayResponse {
  return {
    id: overrides.id ?? dayId,
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-07-10T00:00:00Z'),
    label: overrides.label ?? 'Dia 1 - Sexta-feira',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '18:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? eventId,
  };
}


function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? 'u1u2u3u4-0000-0000-0000-000000000001',
    email: overrides.email ?? 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventDaysController', () => {
  let controller: EventDaysController;
  let serviceMock: jest.Mocked<EventDaysService>;

  beforeEach(async () => {
    serviceMock = {
      findByEvent: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<EventDaysService>;

    const module = await Test.createTestingModule({
      controllers: [EventDaysController],
      providers: [{ provide: EventDaysService, useValue: serviceMock }],
    }).compile();

    controller = module.get(EventDaysController);
  });

  // ── findByEvent ───────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve delegar a listagem ao service e retornar o resultado', async () => {
      const expected = [buildDay(), buildDay({ id: 'd2', dayNumber: 2 })];
      serviceMock.findByEvent.mockResolvedValue(expected);

      const result = await controller.findByEvent(eventId, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith(eventId, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findByEvent.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.findByEvent('id-inexistente', buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildDay();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(dayId, buildUser());

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(dayId, buildUser());
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.findOne('id-inexistente', buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const updated = buildDay({ departureTime: '07:00' });
      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(dayId, { departureTime: '07:00' }, buildUser());

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(dayId, { departureTime: '07:00' }, buildUser());
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.update.mockRejectedValue(
        new UnprocessableEntityException('Não é possível editar dias de um evento com status CLOSED'),
      );

      await expect(controller.update(dayId, { departureTime: '07:00' }, buildUser())).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.update.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.update('id-inexistente', { departureTime: '07:00' }, buildUser())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── cancel ────────────────────────────────────────────────────
  describe('cancel', () => {
    it('deve delegar o cancelamento ao service e retornar o resultado', async () => {
      const cancelled = buildDay({ status: 'CANCELLED' });
      serviceMock.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel(dayId, buildUser());

      expect(result).toEqual(cancelled);
      expect(serviceMock.cancel).toHaveBeenCalledWith(dayId, buildUser());
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.cancel.mockRejectedValue(
        new UnprocessableEntityException('Não é possível cancelar dias de um evento com status CLOSED'),
      );

      await expect(controller.cancel(dayId, buildUser())).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.cancel.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.cancel('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });
});
