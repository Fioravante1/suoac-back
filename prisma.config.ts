import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// ============================================================
// Carregamento de variáveis de ambiente por NODE_ENV
// ============================================================
// development (default) → .env
// test                  → .env.test
// staging               → .env.staging
// production            → .env.production
// ============================================================

const nodeEnv = process.env.NODE_ENV ?? 'development';

const envFileMap: Record<string, string> = {
  development: '.env',
  test: '.env.test',
  staging: '.env.staging',
  production: '.env.production',
};

const envFile = envFileMap[nodeEnv];

if (!envFile) {
  throw new Error(`NODE_ENV inválido: "${nodeEnv}". Valores aceitos: ${Object.keys(envFileMap).join(', ')}`);
}

config({ path: envFile });

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

// ============================================================
// Timeout de lock na sessão de migration
// ============================================================
// A causa mais comum de uma migration "pendurada" não é a migration ser lenta:
// é ela esperar um lock que outra transação está segurando. Sem limite, a espera
// é indefinida — e, como as migrations rodam no pre-deploy do Railway, isso
// pendura o deploy inteiro.
//
// Com `lock_timeout`, a migration falha em segundos e com erro explícito
// ("canceling statement due to lock timeout") em vez de travar. Falhar o deploy
// é barato: o Railway aborta e a versão anterior continua servindo.
//
// Deliberadamente **não** definimos `statement_timeout`: ele mataria uma
// migration legitimamente longa (criação de índice grande, backfill) no meio.
// O teto de tempo total é responsabilidade do `preDeployTimeoutSeconds`, no
// `railway.toml`.
//
// Vale apenas para o CLI do Prisma (migrate, db, seed). A aplicação em runtime
// monta a própria conexão em `PrismaService` e não passa por aqui.
const MIGRATION_SESSION_OPTIONS = 'options=-c%20lock_timeout%3D15s';

function withLockTimeout(url: string): string {
  // Respeita um `options` já presente na URL em vez de sobrescrever.
  if (!url || url.includes('options=')) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}${MIGRATION_SESSION_OPTIONS}`;
}

// prisma generate não precisa de DATABASE_URL (apenas gera o client TypeScript).
// O fail-fast é mantido para comandos que realmente acessam o banco (migrate, seed, etc.).
const isGenerateCommand = process.argv.some((arg) => arg === 'generate');

if (!databaseUrl && !isGenerateCommand) {
  throw new Error(
    `DATABASE_URL não definida. Verifique se o arquivo "${envFile}" existe e contém DATABASE_URL.`,
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // DIRECT_URL é usada pelo Prisma CLI (migrations, introspect, push).
    // Em ambiente Neon, ela aponta para a conexão direta (sem pooler).
    // Se não existir, usa a DATABASE_URL padrão (dev local com Docker).
    url: withLockTimeout(databaseUrl ?? ''),
  },
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
});
