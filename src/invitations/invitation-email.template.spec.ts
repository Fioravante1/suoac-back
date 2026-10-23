import { buildInvitationEmail } from './invitation-email.template';

const LINK = 'https://suoac.example.com/accept-invitation?token=abc';

describe('buildInvitationEmail', () => {
  it('deve endereçar o e-mail ao convidado', () => {
    const message = buildInvitationEmail('maria@example.com', 'Maria', 'João', 'Central', LINK);

    expect(message.to).toBe('maria@example.com');
  });

  it('deve incluir o link nas versões de texto e HTML', () => {
    const message = buildInvitationEmail('maria@example.com', 'Maria', 'João', 'Central', LINK);

    expect(message.text).toContain(LINK);
    expect(message.html).toContain(LINK);
  });

  it('deve escapar HTML em nomes vindos do usuário', () => {
    const message = buildInvitationEmail('maria@example.com', '<script>x</script>', 'João', 'Central', LINK);

    expect(message.html).not.toContain('<script>');
  });
});
