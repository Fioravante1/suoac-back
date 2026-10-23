import type { INVITABLE_ROLES } from '../invitations.constants';

/** Papéis que um convite pode conceder: coordenador ou assistente da congregação. */
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface CreateInvitationInput {
  name: string;
  email: string;
  phone?: string | null;
  role: InvitableRole;
  congregationId: string;
}
