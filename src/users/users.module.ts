import { Module } from '@nestjs/common';
import { HashingModule } from '../common/hashing/hashing.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [HashingModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
