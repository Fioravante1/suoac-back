import type { PrismaClient } from '../../src/generated/prisma/client';
import { type SeedContext, hashPassword } from './common';

export async function seedProd(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const { circuit, congregations } = context;

  const firstCongregation = congregations[0];
  if (!firstCongregation) {
    console.warn('No congregations found, skipping user seed');
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail) {
    console.warn('ADMIN_EMAIL not set, using fallback: coordenador@suoac.dev');
  }
  if (!adminPassword) {
    console.warn('ADMIN_PASSWORD not set, using fallback password');
  }

  const email = adminEmail ?? 'coordenador@suoac.dev';
  const passwordHash = await hashPassword(adminPassword ?? 'Senha@123');

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Coordenador de Circuito',
      passwordHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
    },
    create: {
      name: 'Coordenador de Circuito',
      email,
      passwordHash,
      role: 'CIRCUIT_COORDINATOR',
      circuitId: circuit.id,
      congregationId: firstCongregation.id,
    },
  });
  console.log(`  Admin upserted: ${admin.name} (${admin.email})`);

  console.log('\nProd seed completed: 1 admin created');
}
