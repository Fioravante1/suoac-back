import { endOfDayInEventTimezone, notEndedEventWhere, startOfTodayInEventTimezone } from './event-calendar.util';

describe('endOfDayInEventTimezone', () => {
  it('deve devolver o último milissegundo do dia em São Paulo', () => {
    // 12/10 23:59:59.999 em São Paulo (UTC-3) é 13/10 02:59:59.999 em UTC
    expect(endOfDayInEventTimezone('2026-10-12')).toEqual(new Date('2026-10-13T02:59:59.999Z'));
  });

  it('deve atravessar a virada do mês e do ano', () => {
    expect(endOfDayInEventTimezone('2026-12-31')).toEqual(new Date('2027-01-01T02:59:59.999Z'));
  });

  it('deve usar o horário de verão quando ele valia em São Paulo', () => {
    // Em 15/01/2019, São Paulo estava em UTC-2
    expect(endOfDayInEventTimezone('2019-01-15')).toEqual(new Date('2019-01-16T01:59:59.999Z'));
  });

  it('deve manter o dia inteiro no dia em que o horário de verão começava', () => {
    // 04/11/2018: a meia-noite virou 01h (UTC-3 → UTC-2), e o dia seguinte começa às 02h UTC
    expect(endOfDayInEventTimezone('2018-11-04')).toEqual(new Date('2018-11-05T01:59:59.999Z'));
  });
});

describe('startOfTodayInEventTimezone', () => {
  it('deve devolver a meia-noite UTC do mesmo dia quando já é esse dia em São Paulo', () => {
    expect(startOfTodayInEventTimezone(new Date('2026-08-27T12:00:00Z'))).toEqual(new Date('2026-08-27T00:00:00.000Z'));
  });

  it('deve devolver o dia anterior quando ainda é noite do dia anterior em São Paulo', () => {
    // 27/08 02:00 UTC ainda é 26/08 23:00 em São Paulo (UTC-3)
    expect(startOfTodayInEventTimezone(new Date('2026-08-27T02:00:00Z'))).toEqual(new Date('2026-08-26T00:00:00.000Z'));
  });

  it('deve virar o dia à meia-noite de São Paulo, não à de UTC', () => {
    // 27/08 03:00 UTC é exatamente a meia-noite de 27/08 em São Paulo
    expect(startOfTodayInEventTimezone(new Date('2026-08-27T03:00:00Z'))).toEqual(new Date('2026-08-27T00:00:00.000Z'));
  });
});

describe('notEndedEventWhere', () => {
  it('deve exigir algum dia do evento hoje ou depois', () => {
    const todayStart = new Date('2026-08-27T00:00:00.000Z');

    expect(notEndedEventWhere(todayStart)).toEqual({ eventDays: { some: { date: { gte: todayStart } } } });
  });
});
