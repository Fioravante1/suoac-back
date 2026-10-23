/**
 * Contexto que o `410` do convite expirado carrega: a tela mostra para quem o
 * convite foi enviado, quem o enviou e quando valeu. Quem tem o token já
 * recebeu este e-mail, então nada aqui é novidade para ele.
 */
export interface ExpiredInvitationDetails {
  email: string;
  invitedBy: string;
  sentAt: Date;
  expiresAt: Date;
}
