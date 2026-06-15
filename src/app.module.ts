import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CircuitOwnershipGuard } from './auth/guards/circuit-ownership.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './auth/guards/must-change-password.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CircuitsModule } from './circuits/circuits.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HashingModule } from './common/hashing/hashing.module';
import { getLoggerConfig } from './common/logger/logger.config';
import { CongregationEventStatusModule } from './congregation-event-status/congregation-event-status.module';
import { CongregationsModule } from './congregations/congregations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EventDaysModule } from './event-days/event-days.module';
import { EventPassengersModule } from './event-passengers/event-passengers.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { PassengersModule } from './passengers/passengers.module';
import { PaymentsModule } from './payments/payments.module';
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
    AuditLogModule,
    HealthModule,
    HashingModule,
    EncryptionModule,
    CircuitsModule,
    CongregationEventStatusModule,
    CongregationsModule,
    DashboardModule,
    EventsModule,
    EventDaysModule,
    EventPassengersModule,
    UsersModule,
    AuthModule,
    PassengersModule,
    PaymentsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CircuitOwnershipGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
  ],
})
export class AppModule {}
