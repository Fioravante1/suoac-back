/**
 * Validação fail-fast das variáveis de ambiente sensíveis no boot da aplicação.
 *
 * Diferente da checagem de mera presença feita em cada service, aqui validamos
 * também a *força* dos segredos (comprimento mínimo / formato), evitando que a
 * aplicação suba com um JWT_SECRET fraco ou um ENCRYPTION_KEY malformado.
 */

const MIN_SECRET_LENGTH = 32;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const requireMinLength = (key: string, min: number): void => {
    const value = config[key];
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`${key} é obrigatória`);
      return;
    }
    if (value.length < min) {
      errors.push(`${key} deve ter no mínimo ${min} caracteres (atual: ${value.length})`);
    }
  };

  requireMinLength('JWT_SECRET', MIN_SECRET_LENGTH);
  requireMinLength('JWT_REFRESH_SECRET', MIN_SECRET_LENGTH);
  requireMinLength('PASSWORD_PEPPER', MIN_SECRET_LENGTH);

  const encryptionKey = config['ENCRYPTION_KEY'];
  if (typeof encryptionKey !== 'string' || !/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    errors.push('ENCRYPTION_KEY deve ser uma string hexadecimal de 64 caracteres (32 bytes)');
  }

  const requirePresence = (key: string, reason: string): void => {
    const value = config[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${key} é obrigatória (${reason})`);
    }
  };

  // Sem isso o link de recuperação de senha aponta para lugar nenhum, e o erro
  // só apareceria quando alguém tentasse recuperar a senha.
  requirePresence('FRONTEND_URL', 'usada para montar o link de recuperação de senha');

  // Fora de desenvolvimento e teste o envio vai para o provedor real; sem chave
  // e remetente o e-mail falha em silêncio, porque a resposta ao cliente é
  // deliberadamente neutra.
  const nodeEnv = typeof config['NODE_ENV'] === 'string' ? config['NODE_ENV'] : 'development';
  const usesRealEmailProvider = nodeEnv !== 'development' && nodeEnv !== 'test';

  if (usesRealEmailProvider) {
    requirePresence('RESEND_API_KEY', 'envio de e-mail em staging e produção');
    requirePresence('EMAIL_FROM', 'remetente dos e-mails transacionais');
  }

  if (errors.length > 0) {
    throw new Error(`Validação de variáveis de ambiente falhou:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
