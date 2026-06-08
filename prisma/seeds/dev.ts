import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, hashPassword } from './common';

export async function seedDev(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const passwordHash = await hashPassword('Senha@123');
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];
  const secondCongregation = congregations[1] ?? firstCongregation;

  if (!firstCongregation || !secondCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  const users = [
    {
      email: 'coordenador@suoac.dev',
      name: 'Coordenador de Circuito',
      role: 'CIRCUIT_COORDINATOR' as const,
      congregationId: firstCongregation.id,
    },
    {
      email: 'auxiliar@suoac.dev',
      name: 'Auxiliar de Circuito',
      role: 'CIRCUIT_ASSISTANT' as const,
      congregationId: firstCongregation.id,
    },
    {
      email: 'congregacao@suoac.dev',
      name: 'Coordenador de Congregação',
      role: 'CONGREGATION_COORDINATOR' as const,
      congregationId: firstCongregation.id,
    },
    {
      email: 'congregacao2@suoac.dev',
      name: 'Coordenador de Congregação 2',
      role: 'CONGREGATION_COORDINATOR' as const,
      congregationId: secondCongregation.id,
    },
  ];

  for (const user of users) {
    const result = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: user.congregationId,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        circuitId: circuit.id,
        congregationId: user.congregationId,
      },
    });
    console.log(`  User upserted: ${result.name} (${result.email})`);
  }

  console.log(`\nDev seed completed: ${users.length} users created`);
}
