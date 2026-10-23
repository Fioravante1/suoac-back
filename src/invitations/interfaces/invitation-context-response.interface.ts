/**
 * O que a tela de aceite mostra antes de pedir qualquer dado: o convidado
 * precisa reconhecer quem convidou, o circuito e a congregação para confiar no
 * link. É deliberadamente o mínimo — sem ids e sem telefone ou e-mail de
 * terceiros —, porque a consulta é pública. A exceção é o nome do coordenador
 * da congregação no convite de assistente, que o desenho da tela exibe
 * ("Você vai auxiliar {nome}").
 */
export interface InvitationContextResponse {
  name: string;
  email: string;
  /** Celular do convite, só dígitos; pré-preenche o campo que o convidado confirma. */
  phone: string | null;
  role: string;
  invitedBy: string;
  circuit: string;
  circuitCity: string;
  circuitState: string;
  congregation: string;
  congregationCode: string;
  /**
   * Coordenador da congregação, a quem o assistente vai auxiliar. `null` para o
   * convite de coordenador e quando a congregação ainda não tem coordenador.
   */
  congregationCoordinator: string | null;
  expiresAt: Date;
}
