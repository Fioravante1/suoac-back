import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventDaysController } from './event-days.controller';
import { EventDaysService } from './event-days.service';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const eventId = 'e1e2e3e4-0000-0000-0000-000000000001';
const dayId = 'd1d2d3d4-0000-0000-0000-000000000001';

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

      const result = await controller.findByEvent(eventId);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith(eventId);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findByEvent.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.findByEvent('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve delegar a busca ao service e retornar o resultado', async () => {
      const expected = buildDay();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(dayId);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(dayId);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.findOne.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.findOne('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve delegar a atualização ao service e retornar o resultado', async () => {
      const updated = buildDay({ departureTime: '07:00' });
      serviceMock.update.mockResolvedValue(updated);

      const result = await controller.update(dayId, { departureTime: '07:00' });

      expect(result).toEqual(updated);
      expect(serviceMock.update).toHaveBeenCalledWith(dayId, { departureTime: '07:00' });
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.update.mockRejectedValue(
        new UnprocessableEntityException('Não é possível editar dias de um evento com status CLOSED'),
      );

      await expect(controller.update(dayId, { departureTime: '07:00' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.update.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.update('id-inexistente', { departureTime: '07:00' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancel ────────────────────────────────────────────────────
  describe('cancel', () => {
    it('deve delegar o cancelamento ao service e retornar o resultado', async () => {
      const cancelled = buildDay({ status: 'CANCELLED' });
      serviceMock.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel(dayId);

      expect(result).toEqual(cancelled);
      expect(serviceMock.cancel).toHaveBeenCalledWith(dayId);
    });

    it('deve propagar UnprocessableEntityException do service', async () => {
      serviceMock.cancel.mockRejectedValue(
        new UnprocessableEntityException('Não é possível cancelar dias de um evento com status CLOSED'),
      );

      await expect(controller.cancel(dayId)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.cancel.mockRejectedValue(new NotFoundException('Dia do evento não encontrado'));

      await expect(controller.cancel('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
