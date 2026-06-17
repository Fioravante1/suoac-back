import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventPassengerQueryDto } from './event-passenger-query.dto';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-9222-222222222222';

describe('EventPassengerQueryDto', () => {
  describe('transformação de eventDayIds', () => {
    it('deve aceitar valor único e normalizar para array', () => {
      const dto = plainToInstance(EventPassengerQueryDto, { eventDayIds: UUID_A });
      expect(dto.eventDayIds).toEqual([UUID_A]);
    });

    it('deve aceitar valor repetido (array) e remover duplicados', () => {
      const dto = plainToInstance(EventPassengerQueryDto, { eventDayIds: [UUID_A, UUID_B, UUID_A] });
      expect(dto.eventDayIds).toEqual([UUID_A, UUID_B]);
    });

    it('deve aceitar CSV e aplicar trim em cada item', () => {
      const dto = plainToInstance(EventPassengerQueryDto, { eventDayIds: `${UUID_A} , ${UUID_B}` });
      expect(dto.eventDayIds).toEqual([UUID_A, UUID_B]);
    });
  });

  describe('validação de eventDayIds', () => {
    it('não deve ter erros quando todos os itens são UUID válidos', async () => {
      const dto = plainToInstance(EventPassengerQueryDto, { eventDayIds: [UUID_A, UUID_B] });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('deve falhar na validação isUuid quando há item vazio (ex.: "uuid,")', async () => {
      const dto = plainToInstance(EventPassengerQueryDto, { eventDayIds: `${UUID_A},` });
      const errors = await validate(dto);

      const dayError = errors.find((e) => e.property === 'eventDayIds');
      expect(dayError).toBeDefined();
      expect(dayError!.constraints).toHaveProperty('isUuid');
    });
  });

  describe('transformação de name', () => {
    it('deve aplicar trim no nome', () => {
      const dto = plainToInstance(EventPassengerQueryDto, { name: '  joão  ' });
      expect(dto.name).toBe('joão');
    });
  });
});
