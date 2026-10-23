import type { EmailMessage } from '../common/email/interfaces/email-message.interface';
import type { InvitationDeclineReason } from '../generated/prisma/enums';

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

const DECLINE_REASON_LABEL: Record<InvitationDeclineReason, string> = {
  NOT_THE_PERSON: 'Não sou a pessoa indicada',
  CANNOT_ASSUME_NOW: 'Não posso assumir este privilégio agora',
  RECEIVED_BY_MISTAKE: 'Recebi por engano',
};

interface DeclinedEmailInput {
  to: string;
  inviterName: string;
  inviteeName: string;
  inviteeEmail: string;
  congregation: string;
  reason: InvitationDeclineReason;
}

/**
 * Avisa quem enviou o convite que ele foi recusado e por quê, para que possa
 * convidar outra pessoa. Não leva link: o convite recusado não é mais aceitável.
 */
export function buildInvitationDeclinedEmail(input: DeclinedEmailInput): EmailMessage {
  const { to, inviterName, inviteeName, inviteeEmail, congregation, reason } = input;
  const label = DECLINE_REASON_LABEL[reason];

  const text = [
    `Olá, ${inviterName}.`,
    '',
    `${inviteeName} (${inviteeEmail}) recusou o convite para a congregação ${congregation}.`,
    `Motivo informado: ${label}.`,
    '',
    'O convite não pode mais ser aceito. Se quiser, convide outra pessoa para a congregação.',
  ].join('\n');

  const html = [
    `<p>Olá, ${escapeHtml(inviterName)}.</p>`,
    `<p>${escapeHtml(inviteeName)} (${escapeHtml(inviteeEmail)}) recusou o convite para a congregação <strong>${escapeHtml(congregation)}</strong>.</p>`,
    `<p>Motivo informado: ${escapeHtml(label)}.</p>`,
    '<p>O convite não pode mais ser aceito. Se quiser, convide outra pessoa para a congregação.</p>',
  ].join('');

  return { to, subject: 'Um convite do SUOAC foi recusado', html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
