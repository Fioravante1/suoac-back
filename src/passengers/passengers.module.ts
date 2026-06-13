import { Module } from '@nestjs/common';
import { EncryptionModule } from '../common/encryption/encryption.module';
import { PassengersController } from './passengers.controller';
import { PassengersService } from './passengers.service';

@Module({
  imports: [EncryptionModule],
  controllers: [PassengersController],
  providers: [PassengersService],
  exports: [PassengersService],
})
export class PassengersModule {}
