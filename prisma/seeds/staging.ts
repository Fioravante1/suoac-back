import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, hashPassword } from './common';

export async function seedStaging(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const passwordHash = await hashPassword('UomgsvTiMPRLCDHfzZa*LenJEuKc@_*JTCw96p2v');
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];
  const secondCongregation = congregations[1] ?? firstCongregation;

  if (!firstCongregation || !secondCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  const coordCircuit = await prisma.user.upsert({
    where: { email: 'coordenador@suoac.dev' },
    update: {
      name: 'Coordenador de Circuito',
      passwordHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
    },
    create: {
      name: 'Coordenador de Circuito',
      email: 'coordenador@suoac.dev',
      passwordHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
    },
  });
  console.log(`  User upserted: ${coordCircuit.name} (${coordCircuit.email})`);

  const coordCong = await prisma.user.upsert({
    where: { email: 'congregacao@suoac.dev' },
    update: {
      name: 'Coordenador de Congregação',
      passwordHash,
      role: 'CONGREGATION_COORDINATOR',
      circuitId: circuit.id,
      congregationId: secondCongregation.id,
    },
    create: {
      name: 'Coordenador de Congregação',
      email: 'congregacao@suoac.dev',
      passwordHash,
      role: 'CONGREGATION_COORDINATOR',
      circuitId: circuit.id,
      congregationId: secondCongregation.id,
    },
  });
  console.log(`  User upserted: ${coordCong.name} (${coordCong.email})`);

  console.log('\nStaging seed completed: 2 users created');
}
