import { buildPasswordResetEmail } from './password-reset-email.template';

const TO = 'joao@example.com';
const LINK = 'https://suoac.example.com/reset-password?token=abc';

describe('buildPasswordResetEmail', () => {
  it('deve endereçar a mensagem ao destinatário informado', () => {
    const message = buildPasswordResetEmail(TO, 'João Silva', LINK);

    expect(message.to).toBe(TO);
  });

  it('deve incluir o link nas duas versões do corpo', () => {
    const message = buildPasswordResetEmail(TO, 'João Silva', LINK);

    expect(message.text).toContain(LINK);
    expect(message.html).toContain(LINK);
  });

  it('deve informar o prazo de validade do link', () => {
    const message = buildPasswordResetEmail(TO, 'João Silva', LINK);

    expect(message.text).toContain('1 hora');
    expect(message.html).toContain('1 hora');
  });

  it('deve dizer o que fazer quando o pedido não foi do destinatário', () => {
    const message = buildPasswordResetEmail(TO, 'João Silva', LINK);

    expect(message.text).toContain('ignore este e-mail');
  });

  it('deve escapar o nome para que ele não injete marcação no HTML', () => {
    const message = buildPasswordResetEmail(TO, '<script>alert(1)</script>', LINK);

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});
