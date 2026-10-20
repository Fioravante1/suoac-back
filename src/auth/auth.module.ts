import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../common/email/email.module';
import { HashingModule } from '../common/hashing/hashing.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CircuitSignupService } from './circuit-signup.service';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [UsersModule, HashingModule, EmailModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, CircuitSignupService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
