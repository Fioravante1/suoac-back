import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CircuitsModule } from './circuits/circuits.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
    }),
    PrismaModule,
    CircuitsModule,
  ],
})
export class AppModule {}
