import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, defaultPassword, hashPassword } from './common';
import { seedStagingPassengers } from './staging-passengers';

export async function seedStaging(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];

  if (!firstCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  // Todos os usuários seedados entram com senha padrão (code + @Suoac) e troca obrigatória no
  // primeiro acesso. A senha padrão é previsível, mas só vale até o primeiro login.
  // Por segurança, NÃO logamos a senha em staging (apenas em dev).

  // --- Coordenador de Circuito ---
  const coordCircuitHash = await hashPassword(defaultPassword(firstCongregation.code));
  const coordCircuit = await prisma.user.upsert({
    where: { email: 'coordenador@suoac.dev' },
    update: {
      name: 'Coordenador de Circuito',
      passwordHash: coordCircuitHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
      mustChangePassword: true,
    },
    create: {
      name: 'Coordenador de Circuito',
      email: 'coordenador@suoac.dev',
      passwordHash: coordCircuitHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
      mustChangePassword: true,
    },
  });
  console.log(`  User upserted: ${coordCircuit.name} (${coordCircuit.email})`);

  // --- Coordenador de Congregação para CADA congregação ---
  let congCoordCount = 0;

  for (const cong of congregations) {
    const email = `coord.${cong.code}@suoac.dev`;
    const name = `Coordenador - ${cong.name}`;
    const passwordHash = await hashPassword(defaultPassword(cong.code));

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: 'CONGREGATION_COORDINATOR',
        circuitId: circuit.id,
        congregationId: cong.id,
        mustChangePassword: true,
      },
      create: {
        name,
        email,
        passwordHash,
        role: 'CONGREGATION_COORDINATOR',
        circuitId: circuit.id,
        congregationId: cong.id,
        mustChangePassword: true,
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
