import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CircuitsModule } from './circuits/circuits.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { HashingModule } from './common/hashing/hashing.module';
import { getLoggerConfig } from './common/logger/logger.config';
import { CongregationsModule } from './congregations/congregations.module';
import { EventDaysModule } from './event-days/event-days.module';
import { EventPassengersModule } from './event-passengers/event-passengers.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { PassengersModule } from './passengers/passengers.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
    }),
    LoggerModule.forRoot(getLoggerConfig()),
    PrismaModule,
    HealthModule,
    HashingModule,
    EncryptionModule,
    CircuitsModule,
    CongregationsModule,
    EventsModule,
    EventDaysModule,
    EventPassengersModule,
    UsersModule,
    AuthModule,
    PassengersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
