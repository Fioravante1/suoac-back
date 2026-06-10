import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, hashPassword } from './common';
import { seedStagingPassengers } from './staging-passengers';

export async function seedStaging(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const passwordHash = await hashPassword('UomgsvTiMPRLCDHfzZa*LenJEuKc@_*JTCw96p2v');
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];

  if (!firstCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  // --- Coordenador de Circuito ---
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

  // --- Coordenador de Congregação para CADA congregação ---
  let congCoordCount = 0;

  for (const cong of congregations) {
    const email = `coord.${cong.code}@suoac.dev`;
    const name = `Coordenador - ${cong.name}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: 'CONGREGATION_COORDINATOR',
        circuitId: circuit.id,
        congregationId: cong.id,
      },
      create: {
        name,
        email,
        passwordHash,
        role: 'CONGREGATION_COORDINATOR',
        circuitId: circuit.id,
        congregationId: cong.id,
      },
    });
    console.log(`  User upserted: ${user.name} (${user.email})`);
    congCoordCount++;
  }

  console.log(`\nUsers seed completed: 1 circuit coordinator + ${congCoordCount} congregation coordinators`);

  // --- Passageiros para cada congregação ---
  console.log('\nSeeding passengers...');
  await seedStagingPassengers(prisma, context);
}
