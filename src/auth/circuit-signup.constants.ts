/**
 * Parâmetros do autocadastro de circuito.
 *
 * A validade de 30 minutos é contrato com o frontend — a tela de confirmação do
 * SUC-32 mostra a contagem regressiva —, por isso é constante e não variável de
 * ambiente: mudá-la exige mudar o texto da tela junto.
 */
export const CIRCUIT_SIGNUP = {
  /** Dígitos do código enviado por e-mail. */
  CODE_LENGTH: 6,
  CODE_TTL_MS: 30 * 60 * 1000,
  /**
   * Chutes errados tolerados por rascunho. Seis dígitos são 10^6 combinações, e
   * o limite por e-mail não cobre o chute — só o envio. Esgotado o teto, o
   * rascunho morre e o fluxo recomeça.
   */
  MAX_CODE_ATTEMPTS: 5,
  /** Janela do limite por e-mail. */
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,
  RATE_LIMIT_DEFAULT_MAX: 5,
  /**
   * Idade a partir da qual o rascunho deixa de ter valor e é purgado. Maior que
   * a janela do limite por e-mail, para a contagem não perder histórico.
   */
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
  /** Máximo de congregações aceitas numa solicitação. */
  MAX_CONGREGATIONS: 50,
} as const;
