import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { ENCRYPTION_CONFIG } from './encryption.constants';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }

    this.key = Buffer.from(keyHex, 'hex');

    if (this.key.length !== ENCRYPTION_CONFIG.KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must be exactly ${ENCRYPTION_CONFIG.KEY_LENGTH} bytes (${ENCRYPTION_CONFIG.KEY_LENGTH * 2} hex chars), got ${this.key.length} bytes`,
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_CONFIG.ALGORITHM, this.key, iv, {
      authTagLength: ENCRYPTION_CONFIG.AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Formato: base64(IV || authTag || ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const data = Buffer.from(ciphertext, 'base64');

    const iv = data.subarray(0, ENCRYPTION_CONFIG.IV_LENGTH);
    const authTag = data.subarray(ENCRYPTION_CONFIG.IV_LENGTH, ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.AUTH_TAG_LENGTH);
    const encrypted = data.subarray(ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ENCRYPTION_CONFIG.ALGORITHM, this.key, iv, {
      authTagLength: ENCRYPTION_CONFIG.AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted, undefined, 'utf-8') + decipher.final('utf-8');
  }

  hash(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }
}
