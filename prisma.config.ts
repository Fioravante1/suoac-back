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
    url: databaseUrl ?? '',
  },
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
});
