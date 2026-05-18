import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { ARGON2_CONFIG } from './hashing.constants';

@Injectable()
export class HashingService {
  private readonly pepper: Buffer;

  constructor(private readonly config: ConfigService) {
    const pepperValue = this.config.get<string>('PASSWORD_PEPPER');
    if (!pepperValue) {
      throw new Error('PASSWORD_PEPPER environment variable is not set');
    }
    this.pepper = Buffer.from(pepperValue, 'utf-8');
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2_CONFIG.MEMORY_COST,
      timeCost: ARGON2_CONFIG.TIME_COST,
      parallelism: ARGON2_CONFIG.PARALLELISM,
      hashLength: ARGON2_CONFIG.HASH_LENGTH,
      secret: this.pepper,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password, { secret: this.pepper });
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      memoryCost: ARGON2_CONFIG.MEMORY_COST,
      timeCost: ARGON2_CONFIG.TIME_COST,
    });
  }
}
