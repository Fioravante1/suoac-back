import {
  buildInvitationAcceptedEmail,
  buildInvitationDeclinedEmail,
  buildInvitationEmail,
  buildInvitationRenewalRequestEmail,
} from './invitation-email.template';

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

describe('buildInvitationDeclinedEmail', () => {
  const input = {
    to: 'joao@example.com',
    inviterName: 'João',
    inviteeName: 'Maria',
    inviteeEmail: 'maria@example.com',
    congregation: 'Central',
    reason: 'CANNOT_ASSUME_NOW' as const,
  };

  it('deve endereçar o e-mail a quem enviou o convite', () => {
    expect(buildInvitationDeclinedEmail(input).to).toBe('joao@example.com');
  });

  it('deve dizer quem recusou, a congregação e o motivo em português', () => {
    const message = buildInvitationDeclinedEmail(input);

    expect(message.text).toContain('Maria (maria@example.com)');
    expect(message.text).toContain('Central');
    expect(message.text).toContain('Não posso assumir este privilégio agora');
  });

  it('nao deve levar link para o convite', () => {
    expect(buildInvitationDeclinedEmail(input).html).not.toContain('http');
  });

  it('deve escapar HTML em nomes vindos do usuário', () => {
    const message = buildInvitationDeclinedEmail({ ...input, inviteeName: '<script>x</script>' });

    expect(message.html).not.toContain('<script>');
  });
});

describe('buildInvitationAcceptedEmail', () => {
  const input = {
    to: 'joao@example.com',
    inviterName: 'João',
    userName: 'Maria Souza',
    userEmail: 'maria@example.com',
    congregation: 'Central',
  };

  it('deve endereçar o e-mail a quem enviou o convite', () => {
    expect(buildInvitationAcceptedEmail(input).to).toBe('joao@example.com');
  });

  it('deve dizer quem aceitou e em qual congregação', () => {
    const message = buildInvitationAcceptedEmail(input);

    expect(message.text).toContain('Maria Souza (maria@example.com)');
    expect(message.text).toContain('Central');
  });

  it('deve escapar HTML em nomes vindos do usuário', () => {
    const message = buildInvitationAcceptedEmail({ ...input, userName: '<script>x</script>' });

    expect(message.html).not.toContain('<script>');
  });
});

describe('buildInvitationRenewalRequestEmail', () => {
  const input = {
    to: 'joao@example.com',
    inviterName: 'João',
    inviteeName: 'Maria Souza',
    inviteeEmail: 'maria@example.com',
    congregation: 'Central',
  };

  it('deve endereçar o e-mail a quem enviou o convite', () => {
    expect(buildInvitationRenewalRequestEmail(input).to).toBe('joao@example.com');
  });

  it('deve dizer quem pediu o novo convite, para qual e-mail e em qual congregação', () => {
    const message = buildInvitationRenewalRequestEmail(input);

    expect(message.text).toContain('Maria Souza (maria@example.com)');
    expect(message.text).toContain('Central');
  });

  it('nao deve levar link: quem decide reenviar é o coordenador', () => {
    const message = buildInvitationRenewalRequestEmail(input);

    expect(message.html).not.toContain('http');
    expect(message.text).not.toContain('http');
  });

  it('deve escapar HTML em nomes vindos do usuário', () => {
    const message = buildInvitationRenewalRequestEmail({ ...input, inviteeName: '<script>x</script>' });

    expect(message.html).not.toContain('<script>');
  });
});
