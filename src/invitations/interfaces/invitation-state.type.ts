/**
 * Estado derivado do convite. Não é coluna: sai de `usedAt`, `revokedAt`,
 * `declinedAt` e `expiresAt`, e por isso não há como o estado e as datas
 * divergirem.
 */
export type InvitationState = 'PENDING' | 'USED' | 'REVOKED' | 'DECLINED' | 'EXPIRED';

/** Estados definitivos: o convite não pode mais ser aceito nem recusado, e não carregam contexto extra. */
export type ClosedInvitationState = Exclude<InvitationState, 'PENDING' | 'EXPIRED'>;
