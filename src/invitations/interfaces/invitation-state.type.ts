/**
 * Estado derivado do convite. Não é coluna: sai de `usedAt`, `revokedAt` e
 * `expiresAt`, e por isso não há como o estado e as datas divergirem.
 */
export type InvitationState = 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';
