import type { EmailMessage } from '../common/email/interfaces/email-message.interface';

const SUBJECT = 'Recuperação de senha — SUOAC';

/**
 * Monta o e-mail de recuperação. O link é o único lugar onde o token aparece em
 * claro: ele não é persistido nem registrado em log.
 */
export function buildPasswordResetEmail(to: string, name: string, link: string): EmailMessage {
  const text = [
    `Olá, ${name}.`,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta no SUOAC.',
    'Abra o endereço abaixo para escolher uma senha nova. O link vale por 1 hora.',
    '',
    link,
    '',
    'Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.',
  ].join('\n');

  const html = [
    `<p>Olá, ${escapeHtml(name)}.</p>`,
    '<p>Recebemos um pedido para redefinir a senha da sua conta no SUOAC.</p>',
    `<p><a href="${escapeHtml(link)}">Escolher uma senha nova</a></p>`,
    '<p>O link vale por 1 hora.</p>',
    '<p>Se não foi você quem pediu, ignore este e-mail: sua senha continua a mesma.</p>',
  ].join('');

  return { to, subject: SUBJECT, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
