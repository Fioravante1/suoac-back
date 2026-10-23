/**
 * Parâmetros do convite de coordenador de congregação.
 *
 * Os sete dias são generosos de propósito: convite costuma ser aceito com dias
 * de atraso, e o reenvio renova o prazo para quem deixou passar.
 */
export const INVITATION = {
  /** 32 bytes = 256 bits de entropia, serializados em hexadecimal (64 caracteres). */
  TOKEN_BYTES: 32,
  TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Papéis que um convite pode conceder. A coluna `role` aceita qualquer
 * `UserRole`, então a restrição vive aqui e é conferida em runtime na criação:
 * um convite de papel de circuito daria a quem o aceita poder sobre o circuito.
 *
 * Só o coordenador da congregação entra por convite; o assistente é promovido
 * por ele depois de aceitar o seu.
 */
export const INVITABLE_ROLES = ['CONGREGATION_COORDINATOR'] as const;

/**
 * Código de máquina que acompanha cada erro do convite. O front distingue os
 * estados por ele, e não pelo texto da mensagem, que é só para humanos.
 */
export const INVITATION_ERROR_CODE = {
  NOT_FOUND: 'INVITATION_NOT_FOUND',
  EXPIRED: 'INVITATION_EXPIRED',
  USED: 'INVITATION_USED',
  REVOKED: 'INVITATION_REVOKED',
  EMAIL_ALREADY_REGISTERED: 'INVITATION_EMAIL_ALREADY_REGISTERED',
} as const;

export type InvitationErrorCode = (typeof INVITATION_ERROR_CODE)[keyof typeof INVITATION_ERROR_CODE];
