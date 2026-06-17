/**
 * Script pontual: cria 3 usuários de teste no banco de STAGING para validar o fluxo de
 * troca de senha obrigatória no primeiro acesso (mustChangePassword=true).
 *
 * Idempotente (upsert por email). NÃO mexe nos demais usuários.
 *
 * Execução (carrega .env.staging e usa o PASSWORD_PEPPER de staging para o hash):
 *   NODE_ENV=staging DOTENV_CONFIG_PATH=.env.staging \
 *     npx ts-node -r dotenv/config scripts/create-staging-test-users.ts
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../prisma/seeds/common';

const adapter = new PrismaPg(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

interface TestUser {
  email: string;
  name: string;
  role: 'CONGREGATION_COORDINATOR' | 'CIRCUIT_ASSISTANT';
  password: string;
  congregationIndex: number;
}

const TEST_USERS: TestUser[] = [
  {
    email: 'teste.troca1@suoac.dev',
    name: 'Teste Troca 1 (Congregação)',
    role: 'CONGREGATION_COORDINATOR',
    password: 'TrocaSenha1@2026',
    congregationIndex: 0,
  },
  {
    email: 'teste.troca2@suoac.dev',
    name: 'Teste Troca 2 (Congregação)',
    role: 'CONGREGATION_COORDINATOR',
    password: 'TrocaSenha2@2026',
    congregationIndex: 1,
  },
  {
    email: 'teste.troca3@suoac.dev',
    name: 'Teste Troca 3 (Auxiliar de Circuito)',
    role: 'CIRCUIT_ASSISTANT',
    password: 'TrocaSenha3@2026',
    congregationIndex: 0,
  },
];

async function main(): Promise<void> {
  if (!process.env.PASSWORD_PEPPER) {
    throw new Error('PASSWORD_PEPPER ausente — rode com NODE_ENV=staging e .env.staging carregado.');
  }

  const circuit = (await prisma.circuit.findFirst({ where: { name: 'SP-019 A' } })) ?? (await prisma.circuit.findFirst());

  if (!circuit) {
    throw new Error('Nenhum circuito encontrado no banco de staging.');
  }

  const congregations = await prisma.congregation.findMany({
    where: { circuitId: circuit.id, isActive: true },
    orderBy: { name: 'asc' },
  });

  if (congregations.length === 0) {
    throw new Error('Nenhuma congregação ativa encontrada para o circuito.');
  }

  console.log(`Circuito alvo: ${circuit.name} (${circuit.id})\n`);

  for (const user of TEST_USERS) {
    const congregation = congregations[user.congregationIndex] ?? congregations[0]!;
    const passwordHash = await hashPassword(user.password);

    const result = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: congregation.id,
        mustChangePassword: true,
        refreshTokenHash: null,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: congregation.id,
        mustChangePassword: true,
      },
    });

    console.log(`  ✓ ${result.email} | role=${result.role} | congregação=${congregation.name} | senha=${user.password}`);
  }

  console.log(`\n${TEST_USERS.length} usuários de teste criados/atualizados (mustChangePassword=true).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
