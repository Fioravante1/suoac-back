import { EventType } from '../generated/prisma/enums';
import { addEventDays, composeEventTitle, countEventDays, requiresEndDate, usesEndDate } from './event-type.util';

describe('event-type.util', () => {
  describe('composeEventTitle', () => {
    it.each([
      [EventType.ASSEMBLY, 'Assembleia Ouça o que o espírito diz'],
      [EventType.REGIONAL_CONVENTION, 'Congresso Ouça o que o espírito diz'],
      [EventType.OTHER, 'Ouça o que o espírito diz'],
    ])('deve compor o título do tipo %s', (type, expected) => {
      expect(composeEventTitle(type, 'Ouça o que o espírito diz')).toBe(expected);
    });
  });

  describe('usesEndDate e requiresEndDate', () => {
    it('deve ignorar endDate só na assembleia e exigi-lo só no congresso regional', () => {
      expect(usesEndDate(EventType.ASSEMBLY)).toBe(false);
      expect(usesEndDate(EventType.REGIONAL_CONVENTION)).toBe(true);
      expect(usesEndDate(EventType.OTHER)).toBe(true);
      expect(requiresEndDate(EventType.REGIONAL_CONVENTION)).toBe(true);
      expect(requiresEndDate(EventType.OTHER)).toBe(false);
      expect(requiresEndDate(EventType.ASSEMBLY)).toBe(false);
    });
  });

  describe('countEventDays', () => {
    it('deve contar 1 dia na assembleia, mesmo com endDate', () => {
      expect(countEventDays(EventType.ASSEMBLY, '2026-07-10', '2026-07-12')).toBe(1);
    });

    it.each([undefined, null])('deve contar 1 dia sem endDate (%s)', (endDate) => {
      expect(countEventDays(EventType.OTHER, '2026-07-10', endDate)).toBe(1);
    });

    it('deve contar o primeiro e o último dia', () => {
      expect(countEventDays(EventType.REGIONAL_CONVENTION, '2026-07-10', '2026-07-12')).toBe(3);
    });
  });

  describe('addEventDays', () => {
    it('deve devolver meia-noite UTC do dia deslocado', () => {
      expect(addEventDays('2026-07-31', 1)).toEqual(new Date('2026-08-01T00:00:00Z'));
    });
  });
});
