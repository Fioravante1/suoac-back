import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CircuitsModule } from './circuits/circuits.module';
import { getLoggerConfig } from './common/logger/logger.config';
import { CongregationsModule } from './congregations/congregations.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
    }),
    LoggerModule.forRoot(getLoggerConfig()),
    PrismaModule,
    CircuitsModule,
    CongregationsModule,
  ],
})
export class AppModule {}
