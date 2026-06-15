import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, defaultPassword, hashPassword } from './common';

export async function seedDev(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];
  const secondCongregation = congregations[1] ?? firstCongregation;

  if (!firstCongregation || !secondCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  // Usuários de circuito: senha conhecida, sem troca obrigatória.
  // Usuários de congregação: senha padrão (code + @Suoac) + troca obrigatória no primeiro acesso.
  const users = [
    {
      email: 'coordenador@suoac.dev',
      name: 'Coordenador de Circuito',
      role: 'CIRCUIT_COORDINATOR' as const,
      congregation: firstCongregation,
      password: 'Senha@123',
      mustChangePassword: false,
    },
    {
      email: 'auxiliar@suoac.dev',
      name: 'Auxiliar de Circuito',
      role: 'CIRCUIT_ASSISTANT' as const,
      congregation: firstCongregation,
      password: 'Senha@123',
      mustChangePassword: false,
    },
    {
      email: 'congregacao@suoac.dev',
      name: 'Coordenador de Congregação',
      role: 'CONGREGATION_COORDINATOR' as const,
      congregation: firstCongregation,
      password: defaultPassword(firstCongregation.code),
      mustChangePassword: true,
    },
    {
      email: 'congregacao2@suoac.dev',
      name: 'Coordenador de Congregação 2',
      role: 'CONGREGATION_COORDINATOR' as const,
      congregation: secondCongregation,
      password: defaultPassword(secondCongregation.code),
      mustChangePassword: true,
    },
  ];

  for (const user of users) {
    const passwordHash = await hashPassword(user.password);
    const result = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: user.congregation.id,
        mustChangePassword: user.mustChangePassword,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: user.congregation.id,
        mustChangePassword: user.mustChangePassword,
      },
    });
    const hint = user.mustChangePassword ? ` [senha padrão: ${user.password} — troca obrigatória]` : '';
    console.log(`  User upserted: ${result.name} (${result.email})${hint}`);
  }

  console.log(`\nDev seed completed: ${users.length} users created`);
}
