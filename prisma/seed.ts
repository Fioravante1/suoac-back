import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedCommon } from './seeds/common';
import { seedDev } from './seeds/dev';
import { seedProd } from './seeds/prod';
import { seedStaging } from './seeds/staging';

const adapter = new PrismaPg(process.env.DIRECT_URL ?? process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function validateSeedEnvironment(env: string): void {
  if (env === 'development') {
    return;
  }

  if (process.env.PASSWORD_PEPPER) {
    return;
  }

  throw new Error('PASSWORD_PEPPER environment variable is required for staging and production seeds');
}

async function main(): Promise<void> {
  const env = process.env.NODE_ENV ?? 'development';
  validateSeedEnvironment(env);
  console.log(`Running seed for environment: ${env}\n`);

  const context = await seedCommon(prisma);

  switch (env) {
    case 'production':
      await seedProd(prisma, context);
      break;
    case 'staging':
      await seedStaging(prisma, context);
      break;
    default:
      await seedDev(prisma, context);
      break;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
