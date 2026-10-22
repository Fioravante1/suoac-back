/**
 * Parâmetros do fluxo de recuperação de senha.
 *
 * A validade de 1 hora é contrato com o frontend — a tela de confirmação do
 * SUC-25 informa esse prazo ao usuário —, por isso é constante e não variável
 * de ambiente: mudá-la exige mudar o texto da tela junto.
 */
export const PASSWORD_RESET = {
  /** 32 bytes = 256 bits de entropia, serializados em hexadecimal (64 caracteres). */
  TOKEN_BYTES: 32,
  TOKEN_HEX_LENGTH: 64,
  TOKEN_TTL_MS: 60 * 60 * 1000,
  /** Janela do limite por e-mail. */
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,
  RATE_LIMIT_DEFAULT_MAX: 3,
  /** Idade a partir da qual uma solicitação deixa de ter valor e é purgada. */
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
} as const;
