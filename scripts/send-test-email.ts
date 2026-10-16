/**
 * Envia um e-mail de teste pelo adaptador real do Resend.
 *
 * Existe para provar a entrega ponta a ponta — chave de API, domínio verificado,
 * DNS e remetente — sem depender de alguém pedir recuperação de senha. Usa o
 * mesmo template do fluxo real, para que o que chega na caixa seja exatamente o
 * que o usuário veria.
 *
 * Uso:
 *   NODE_ENV=staging npx ts-node scripts/send-test-email.ts destino@example.com
 *
 * O adaptador de log (development/test) é ignorado de propósito: aqui o objetivo
 * é falar com o provedor de verdade.
 */
import { config } from 'dotenv';
import { buildPasswordResetEmail } from '../src/auth/password-reset-email.template';
import { type EmailConfigReader, ResendEmailSender } from '../src/common/email/resend-email-sender';

const ENV_FILE_MAP: Record<string, string> = {
  development: '.env',
  test: '.env.test',
  staging: '.env.staging',
  production: '.env.production',
};

function loadEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const envFile = ENV_FILE_MAP[nodeEnv];

  if (!envFile) {
    throw new Error(`NODE_ENV inválido: "${nodeEnv}". Valores aceitos: ${Object.keys(ENV_FILE_MAP).join(', ')}`);
  }

  config({ path: envFile });
  console.info(`Variáveis carregadas de ${envFile} (NODE_ENV=${nodeEnv})`);
}

function readRecipient(): string {
  const recipient = process.argv[2];

  if (!recipient || !recipient.includes('@')) {
    throw new Error('Informe o destinatário: npx ts-node scripts/send-test-email.ts destino@example.com');
  }

  return recipient;
}

function buildConfigReader(): EmailConfigReader {
  return { get: (key: string) => process.env[key] };
}

async function main(): Promise<void> {
  loadEnv();
  const recipient = readRecipient();

  const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/+$/, '');

  if (!frontendUrl) {
    throw new Error('FRONTEND_URL não definida — o link do e-mail ficaria quebrado.');
  }

  // Token obviamente falso: este link não redefine senha de ninguém, serve para
  // conferir como a mensagem chega na caixa de entrada.
  const link = `${frontendUrl}/reset-password?token=${'0'.repeat(64)}`;
  const message = buildPasswordResetEmail(recipient, 'Teste de Entrega', link);

  const sender = new ResendEmailSender(buildConfigReader());
  await sender.send(message);

  console.info(`E-mail de teste aceito pelo provedor para ${recipient}.`);
  console.info('Confira a caixa de entrada e, se não chegar, o painel do Resend (aba Emails).');
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
