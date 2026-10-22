import type { EmailMessage } from '../common/email/interfaces/email-message.interface';

const SUBJECT = 'Confirme seu cadastro — SUOAC';

/**
 * Monta o e-mail com o código de confirmação do autocadastro. O código é o
 * único lugar onde ele aparece em claro: no banco fica apenas o SHA-256, e ele
 * não vai para log nenhum.
 */
export function buildCircuitSignupEmail(to: string, name: string, code: string, circuitName: string): EmailMessage {
  const text = [
    `Olá, ${name}.`,
    '',
    `Recebemos o cadastro do circuito ${circuitName} no SUOAC.`,
    'Para concluir, digite o código abaixo na tela de confirmação:',
    '',
    code,
    '',
    'O código vale por 30 minutos.',
    '',
    'Se não foi você quem pediu, ignore este e-mail: nada foi criado.',
  ].join('\n');

  const html = [
    `<p>Olá, ${escapeHtml(name)}.</p>`,
    `<p>Recebemos o cadastro do circuito <strong>${escapeHtml(circuitName)}</strong> no SUOAC.</p>`,
    '<p>Para concluir, digite o código abaixo na tela de confirmação:</p>',
    `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(code)}</p>`,
    '<p>O código vale por 30 minutos.</p>',
    '<p>Se não foi você quem pediu, ignore este e-mail: nada foi criado.</p>',
  ].join('');

  return { to, subject: SUBJECT, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
