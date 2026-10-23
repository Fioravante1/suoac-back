/**
 * O que a tela de aceite mostra antes de pedir qualquer dado: o convidado
 * precisa reconhecer quem convidou, o circuito e a congregação para confiar no
 * link. É deliberadamente o mínimo — sem telefone, sem ids e sem dados de quem
 * não é o convidado —, porque a consulta é pública.
 */
export interface InvitationContextResponse {
  name: string;
  email: string;
  role: string;
  invitedBy: string;
  circuit: string;
  congregation: string;
  expiresAt: Date;
}
