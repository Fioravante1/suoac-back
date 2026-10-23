import type { EmailMessage } from '../common/email/interfaces/email-message.interface';

const SUBJECT = 'Você foi convidado para o SUOAC';

/**
 * Monta o e-mail do convite. O link é o único lugar onde o token aparece em
 * claro: no banco fica apenas o SHA-256, e ele não vai para log nenhum.
 */
export function buildInvitationEmail(
  to: string,
  name: string,
  invitedBy: string,
  congregation: string,
  link: string,
): EmailMessage {
  const text = [
    `Olá, ${name}.`,
    '',
    `${invitedBy} convidou você para usar o SUOAC como responsável pela congregação ${congregation}.`,
    'Para concluir o seu cadastro, defina uma senha pelo link abaixo:',
    '',
    link,
    '',
    'O convite vale por 7 dias.',
    '',
    'Se você não esperava este convite, ignore este e-mail: nada foi criado.',
  ].join('\n');

  const html = [
    `<p>Olá, ${escapeHtml(name)}.</p>`,
    `<p>${escapeHtml(invitedBy)} convidou você para usar o SUOAC como responsável pela congregação <strong>${escapeHtml(congregation)}</strong>.</p>`,
    '<p>Para concluir o seu cadastro, defina uma senha pelo link abaixo:</p>',
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    '<p>O convite vale por 7 dias.</p>',
    '<p>Se você não esperava este convite, ignore este e-mail: nada foi criado.</p>',
  ].join('');

  return { to, subject: SUBJECT, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
