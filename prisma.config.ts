import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Carrega .env.production se NODE_ENV=production, com fallback para .env
config({ path: `.env.${process.env.NODE_ENV ?? 'development'}` });
config({ path: '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // DIRECT_URL é usada pelo Prisma CLI (migrations, introspect, push).
    // Em ambiente Neon, ela aponta para a conexão direta (sem pooler).
    // Se não existir, usa a DATABASE_URL padrão (dev local com Docker).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
