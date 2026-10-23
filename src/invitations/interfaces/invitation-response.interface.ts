import type { InvitationState } from './invitation-state.type';

/**
 * Convite como o coordenador do circuito o vê. Nunca carrega o hash do token.
 */
export interface InvitationResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  congregationId: string;
  state: InvitationState;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Resposta de criação e reenvio: o link em claro só existe neste momento — no
 * banco fica o SHA-256 —, e o coordenador pode precisar dele para mandar pelo
 * WhatsApp.
 */
export interface IssuedInvitationResponse extends InvitationResponse {
  link: string;
}
