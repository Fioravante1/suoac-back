import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { INVITATION_ERROR_CODE } from './invitations.constants';
import type { ExpiredInvitationDetails } from './interfaces/expired-invitation-details.interface';

/**
 * Exceções do convite. Cada uma leva `code` no corpo, repassado pelo
 * `AllExceptionsFilter`, para o front tratar cada estado sem ler a mensagem.
 * O expirado leva também `invitation`, com o contexto que a tela mostra.
 */

export function invitationNotFound(): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    message: 'Convite não encontrado',
    error: 'Not Found',
    code: INVITATION_ERROR_CODE.NOT_FOUND,
  });
}

export function invitationExpired(details: ExpiredInvitationDetails): GoneException {
  return new GoneException({
    statusCode: 410,
    message: 'Este convite expirou. Peça um novo convite a quem convidou você.',
    error: 'Gone',
    code: INVITATION_ERROR_CODE.EXPIRED,
    invitation: details,
  });
}

export function invitationUsed(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: 'Este convite já foi utilizado. Entre no sistema com o seu e-mail e a sua senha.',
    error: 'Conflict',
    code: INVITATION_ERROR_CODE.USED,
  });
}

export function invitationRevoked(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    message: 'Este convite foi cancelado. Peça um novo convite a quem convidou você.',
    error: 'Forbidden',
    code: INVITATION_ERROR_CODE.REVOKED,
  });
}

export function invitationEmailAlreadyRegistered(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    message: 'Já existe uma conta com este e-mail. Entre no sistema com a sua senha.',
    error: 'Conflict',
    code: INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED,
  });
}

/**
 * Exceção correspondente a um estado definitivo em que o convite não pode mais
 * ser aceito. O expirado fica de fora porque carrega contexto: ver
 * `invitationExpired`.
 */
export function exceptionForState(state: 'USED' | 'REVOKED'): Error {
  if (state === 'USED') {
    return invitationUsed();
  }

  return invitationRevoked();
}
