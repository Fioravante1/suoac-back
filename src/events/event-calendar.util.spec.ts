import { notEndedEventWhere, startOfTodayInEventTimezone } from './event-calendar.util';

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
