import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type PrismaClient as PrismaClientType } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly prisma: PrismaClientType;

  constructor() {
    const adapter = new PrismaPg(process.env.DATABASE_URL!);
    this.prisma = new PrismaClient({ adapter });
  }

  get client(): PrismaClientType {
    return this.prisma;
  }

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
    this.logger.log('Conexão com o banco de dados estabelecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.log('Conexão com o banco de dados encerrada');
  }
}
