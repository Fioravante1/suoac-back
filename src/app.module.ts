import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CircuitsModule } from './circuits/circuits.module';
import { CongregationsModule } from './congregations/congregations.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
    }),
    PrismaModule,
    CircuitsModule,
    CongregationsModule,
  ],
})
export class AppModule {}
