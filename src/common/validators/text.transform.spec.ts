import { toTrimmed } from './text.transform';

describe('toTrimmed', () => {
  it('deve tirar os espaços das pontas e manter os do meio', () => {
    expect(toTrimmed('  Maria   Souza  ')).toBe('Maria   Souza');
  });

  it('deve tirar quebras de linha e tabulações das pontas', () => {
    expect(toTrimmed('\t Maria \n')).toBe('Maria');
  });

  it.each([[undefined], [null], [42], [{}], [['a']]])(
    'deve deixar %j passar sem mexer, para a validação recusar',
    (input) => {
      expect(toTrimmed(input)).toBe(input);
    },
  );
});
