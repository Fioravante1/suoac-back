import { PHONE_DIGITS_MESSAGE, PHONE_DIGITS_REGEX, onlyDigits, toPhoneDigits } from './phone.constants';

describe('toPhoneDigits', () => {
  it.each([
    ['(11) 98765-4321', '11987654321'],
    ['11 98765-4321', '11987654321'],
    ['  11987654321  ', '11987654321'],
    ['+55 (11) 98765-4321', '5511987654321'],
    ['', ''],
  ])('deve tirar a máscara de %j', (input, expected) => {
    expect(toPhoneDigits(input)).toBe(expected);
  });

  it.each([[undefined], [null], [11987654321], [{}], [['11']]])(
    'deve deixar %j passar sem mexer, para a validação recusar',
    (input) => {
      expect(toPhoneDigits(input)).toBe(input);
    },
  );
});

describe('onlyDigits', () => {
  it('deve manter só os dígitos', () => {
    expect(onlyDigits('(19) 99654-3210 ramal 4')).toBe('199965432104');
  });

  it('deve devolver vazio quando não há dígitos', () => {
    expect(onlyDigits('sem número')).toBe('');
  });
});

describe('PHONE_DIGITS_REGEX', () => {
  it.each(['1133334444', '11987654321'])('deve aceitar DDD mais 8 ou 9 dígitos: %s', (phone) => {
    expect(PHONE_DIGITS_REGEX.test(phone)).toBe(true);
  });

  it.each(['119876543', '119876543210', '(11) 98765-4321', '11 98765432', '', 'abcdefghijk'])(
    'deve recusar celular incompleto, longo ou com máscara: %j',
    (phone) => {
      expect(PHONE_DIGITS_REGEX.test(phone)).toBe(false);
    },
  );

  it('deve ter a mensagem que os fluxos já mostravam', () => {
    expect(PHONE_DIGITS_MESSAGE).toBe('O celular deve ter DDD e 8 ou 9 dígitos');
  });
});
