import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  // Upsert circuit SP-019 A
  const circuit = await prisma.circuit.upsert({
    where: { name: 'SP-019 A' },
    update: { city: 'São Paulo', state: 'SP' },
    create: {
      name: 'SP-019 A',
      city: 'São Paulo',
      state: 'SP',
    },
  });

  console.log(`Circuit upserted: ${circuit.name} (${circuit.id})`);

  // Congregations data for SP-019 A
  const congregations = [
    { code: '80275', name: 'Águas de Março', email: 'CONG09480275@jwpub.org' },
    { code: '87577', name: 'Andorinha da Mata', email: 'CONG09487577@jwpub.org' },
    { code: '273', name: 'Carmosina', email: 'CONG094273@jwpub.org' },
    { code: '105478', name: 'Cidade Popular', email: 'CONG094105478@jwpub.org' },
    { code: '26252', name: 'Conjunto José Bonifácio', email: 'CONG09426252@jwpub.org' },
    { code: '66803', name: 'Cosmopolita', email: 'CONG09466803@jwpub.org' },
    { code: '114553', name: 'Estrada da Fonte', email: 'CONG094114553@jwpub.org' },
    { code: '118901', name: 'Fontoura', email: 'CONG094118901@jwpub.org' },
    { code: '455', name: 'Guaianazes', email: 'CONG094455@jwpub.org' },
    { code: '547', name: 'Itaquera', email: 'CONG094547@jwpub.org' },
    { code: '30072', name: 'Jardim São Pedro', email: 'CONG09430072@jwpub.org' },
    { code: '29652', name: 'Jardim Tamoyo', email: 'CONG09429652@jwpub.org' },
    { code: '31468', name: 'Marabá', email: 'CONG09431468@jwpub.org' },
    { code: '109256', name: 'Parque do Carmo', email: 'CONG094109256@jwpub.org' },
    { code: '79079', name: 'Serra de São Domingos', email: 'CONG09479079@jwpub.org' },
    { code: '115717', name: 'Silvianópolis', email: 'CONG094115717@jwpub.org' },
    { code: '30718', name: 'Vila Jussara', email: 'CONG09430718@jwpub.org' },
    { code: '1941', name: 'Vila Rosa', email: 'CONG0941941@jwpub.org' },
  ];

  for (const cong of congregations) {
    const result = await prisma.congregation.upsert({
      where: { code: cong.code },
      update: { name: cong.name, email: cong.email, circuitId: circuit.id },
      create: {
        code: cong.code,
        name: cong.name,
        email: cong.email,
        circuitId: circuit.id,
      },
    });
    console.log(`  Congregation upserted: ${result.name} (${result.code})`);
  }

  console.log(`\nSeed completed: ${congregations.length} congregations for circuit ${circuit.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
