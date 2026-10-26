import { FULL_NAME_MESSAGE, FULL_NAME_REGEX, PERSON_NAME_LENGTH, toCollapsedName } from './name.constants';

describe('toCollapsedName', () => {
  it('deve tirar os espaços das pontas e reduzir os do meio a um só', () => {
    expect(toCollapsedName('  Maria   de \t Souza  ')).toBe('Maria de Souza');
  });

  it.each([[undefined], [null], [42], [{}]])('deve deixar %j passar sem mexer', (input) => {
    expect(toCollapsedName(input)).toBe(input);
  });
});

describe('FULL_NAME_REGEX', () => {
  it.each(['Maria Souza', 'Maria de Souza Lima', 'Ana B.'])('deve aceitar nome e sobrenome: %s', (name) => {
    expect(FULL_NAME_REGEX.test(name)).toBe(true);
  });

  it('deve aceitar qualquer sequência de espaços entre as palavras, sem depender de o nome ter sido colapsado antes', () => {
    expect(FULL_NAME_REGEX.test('Maria  Souza')).toBe(true);
    expect(FULL_NAME_REGEX.test('Maria\tSouza')).toBe(true);
  });

  it.each(['Maria', '', ' Maria', 'Maria ', ' '])(
    'deve recusar nome sem sobrenome ou com espaço nas pontas: %j',
    (name) => {
      expect(FULL_NAME_REGEX.test(name)).toBe(false);
    },
  );

  it('deve ter a mensagem que o aceite de convite já mostrava', () => {
    expect(FULL_NAME_MESSAGE).toBe('Informe nome e sobrenome');
  });
});

describe('PERSON_NAME_LENGTH', () => {
  it('deve manter os limites que os fluxos já usavam', () => {
    expect(PERSON_NAME_LENGTH).toEqual({ MIN: 2, MAX: 150 });
  });
});
