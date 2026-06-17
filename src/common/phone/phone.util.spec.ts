import { formatPhone } from './phone.util';

describe('formatPhone', () => {
  it('deve formatar celular (11 dígitos) como "11 97753-0630"', () => {
    expect(formatPhone('11977530630')).toBe('11 97753-0630');
  });

  it('deve formatar telefone fixo (10 dígitos) como "11 2555-7709"', () => {
    expect(formatPhone('1125557709')).toBe('11 2555-7709');
  });

  it('deve ignorar símbolos e espaços na entrada', () => {
    expect(formatPhone('(11) 98888-1234')).toBe('11 98888-1234');
  });

  it('deve retornar null quando o telefone é null', () => {
    expect(formatPhone(null)).toBeNull();
  });

  it('deve retornar null quando o telefone é undefined', () => {
    expect(formatPhone(undefined)).toBeNull();
  });

  it('deve retornar null quando o telefone é string vazia', () => {
    expect(formatPhone('')).toBeNull();
  });

  it('deve devolver o valor original quando não tem 10 ou 11 dígitos', () => {
    expect(formatPhone('123')).toBe('123');
  });
});
