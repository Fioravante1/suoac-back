import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HashingModule } from '../common/hashing/hashing.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, HashingModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
