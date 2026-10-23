import { normalizeEmail, toNormalizedEmail } from './email.transform';

describe('normalizeEmail', () => {
  it.each([
    ['Fulano@Exemplo.COM', 'fulano@exemplo.com'],
    ['  fulano@exemplo.com  ', 'fulano@exemplo.com'],
    ['\tJOAO.SILVA+Tag@Example.com\n', 'joao.silva+tag@example.com'],
    ['já@minúsculo.com', 'já@minúsculo.com'],
  ])('deve levar %j à forma única %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('deve ser idempotente', () => {
    const once = normalizeEmail(' Fulano@X.com ');

    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('toNormalizedEmail', () => {
  it('deve normalizar texto', () => {
    expect(toNormalizedEmail('  Maria@Example.com ')).toBe('maria@example.com');
  });

  it.each([[undefined], [null], [42], [{}], [['a@b.com']]])(
    'deve deixar %j passar sem mexer, para a validação recusar',
    (input) => {
      expect(toNormalizedEmail(input)).toBe(input);
    },
  );
});
