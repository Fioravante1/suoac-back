import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventType } from '../../generated/prisma/enums';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventDto } from './update-event.dto';

// ── Helpers ──────────────────────────────────────────────────────
function buildRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Congresso Regional 2026',
    type: EventType.REGIONAL_CONVENTION,
    ticketPrice: 40,
    registrationDeadline: '2026-10-12',
    paymentDeadline: '2026-10-19',
    venue: 'Salão de Assembleias',
    address: 'Rua das Flores, 100',
    city: 'Campinas',
    state: 'SP',
    date: '2026-10-23',
    endDate: '2026-10-25',
    departureTime: '06:30',
    returnTime: '18:30',
    ...overrides,
  };
}

/** Mensagens de erro por campo, para a asserção ficar legível. */
async function messagesByField(dto: object): Promise<Record<string, string[]>> {
  const errors = await validate(dto);

  return Object.fromEntries(errors.map((error) => [error.property, Object.values(error.constraints ?? {})]));
}

const INVALID_DATES = [
  ['com hora', '2026-10-12T10:00:00.000Z'],
  ['no formato brasileiro', '12/10/2026'],
  ['que não existe', '2026-02-30'],
  ['vazia', ''],
];

// ── Test Suite ───────────────────────────────────────────────────
describe('CreateEventDto', () => {
  it('deve aceitar as datas no formato AAAA-MM-DD', async () => {
    expect(await messagesByField(plainToInstance(CreateEventDto, buildRaw()))).toEqual({});
  });

  describe.each(['registrationDeadline', 'paymentDeadline', 'date', 'endDate'])('%s', (field) => {
    it.each(INVALID_DATES)('deve recusar a data %s, dizendo o formato', async (_case, value) => {
      const messages = await messagesByField(plainToInstance(CreateEventDto, buildRaw({ [field]: value })));

      expect(messages[field]).toContain(`${field} deve ser uma data no formato AAAA-MM-DD`);
    });
  });

  it('não deve exigir endDate na assembleia', async () => {
    const raw = buildRaw({ type: EventType.ASSEMBLY, endDate: undefined });

    expect(await messagesByField(plainToInstance(CreateEventDto, raw))).toEqual({});
  });
});

describe('UpdateEventDto', () => {
  it('deve aceitar a edição sem prazos', async () => {
    expect(await messagesByField(plainToInstance(UpdateEventDto, { title: 'Novo título' }))).toEqual({});
  });

  describe.each(['registrationDeadline', 'paymentDeadline'])('%s', (field) => {
    it('deve aceitar a data no formato AAAA-MM-DD', async () => {
      expect(await messagesByField(plainToInstance(UpdateEventDto, { [field]: '2026-10-12' }))).toEqual({});
    });

    it.each(INVALID_DATES)('deve recusar a data %s, dizendo o formato', async (_case, value) => {
      const messages = await messagesByField(plainToInstance(UpdateEventDto, { [field]: value }));

      expect(messages[field]).toContain(`${field} deve ser uma data no formato AAAA-MM-DD`);
    });
  });
});
