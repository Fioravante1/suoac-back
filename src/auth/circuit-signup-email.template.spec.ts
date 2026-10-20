import { buildCircuitSignupEmail } from './circuit-signup-email.template';

const TO = 'joao@example.com';
const CODE = '042137';
const CIRCUIT_CODE = 'SP-17';

describe('buildCircuitSignupEmail', () => {
  it('deve endereçar a mensagem ao destinatário informado', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, CIRCUIT_CODE);

    expect(message.to).toBe(TO);
  });

  it('deve incluir o código nas duas versões do corpo', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, CIRCUIT_CODE);

    expect(message.text).toContain(CODE);
    expect(message.html).toContain(CODE);
  });

  it('deve preservar os zeros à esquerda do código', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', '000042', CIRCUIT_CODE);

    // Tratar o código como número comeria os zeros, e o que chega na tela tem
    // seis caixas para preencher.
    expect(message.text).toContain('000042');
  });

  it('deve dizer de qual circuito é o cadastro', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, CIRCUIT_CODE);

    expect(message.text).toContain(CIRCUIT_CODE);
    expect(message.html).toContain(CIRCUIT_CODE);
  });

  it('deve informar o prazo de validade do código', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, CIRCUIT_CODE);

    expect(message.text).toContain('30 minutos');
    expect(message.html).toContain('30 minutos');
  });

  it('deve deixar claro que nada foi criado quando o pedido não foi do destinatário', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, CIRCUIT_CODE);

    // Diferente da recuperação de senha, aqui a tranquilização é outra: não
    // existe conta nem circuito até alguém digitar o código.
    expect(message.text).toContain('nada foi criado');
  });

  it('deve escapar o nome para que ele não injete marcação no HTML', () => {
    const message = buildCircuitSignupEmail(TO, '<script>alert(1)</script>', CODE, CIRCUIT_CODE);

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('deve escapar o código do circuito, que vem do que o usuário digitou', () => {
    const message = buildCircuitSignupEmail(TO, 'João Silva', CODE, '<img src=x>');

    expect(message.html).not.toContain('<img src=x>');
  });
});
