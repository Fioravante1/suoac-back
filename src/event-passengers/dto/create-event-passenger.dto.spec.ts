import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventPassengerDto } from './create-event-passenger.dto';

const DAY_ID_1 = '11111111-1111-4111-8111-111111111111';
const DAY_ID_2 = '22222222-2222-4222-8222-222222222222';

async function errorFields(raw: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateEventPassengerDto, raw));

  return errors.map((error) => error.property);
}

describe('CreateEventPassengerDto — dayIds', () => {
  it('deve aceitar uma lista de dias sem repetição', async () => {
    expect(await errorFields({ dayIds: [DAY_ID_1, DAY_ID_2] })).toEqual([]);
  });

  it('deve recusar um texto no lugar da lista', async () => {
    expect(await errorFields({ dayIds: DAY_ID_1 })).toContain('dayIds');
  });

  it('deve recusar o mesmo dia duas vezes', async () => {
    expect(await errorFields({ dayIds: [DAY_ID_1, DAY_ID_1] })).toContain('dayIds');
  });
});
