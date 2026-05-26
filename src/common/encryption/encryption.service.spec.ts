import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { ENCRYPTION_CONFIG } from './encryption.constants';
import { EncryptionService } from './encryption.service';

const TEST_KEY = randomBytes(ENCRYPTION_CONFIG.KEY_LENGTH).toString('hex');

function buildConfigService(key: string | undefined): Partial<ConfigService> {
  return {
    get: jest.fn().mockReturnValue(key),
  };
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EncryptionService, { provide: ConfigService, useValue: buildConfigService(TEST_KEY) }],
    }).compile();

    service = module.get(EncryptionService);
  });

  // ── encrypt / decrypt ─────────────────────────────────────────
  describe('encrypt / decrypt', () => {
    it('deve criptografar e descriptografar corretamente (roundtrip)', () => {
      const plaintext = '12345678X';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('deve gerar ciphertexts diferentes para o mesmo plaintext (IV aleatorio)', () => {
      const plaintext = '12345678X';

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('deve funcionar com strings vazias', () => {
      const encrypted = service.encrypt('');
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('deve funcionar com caracteres especiais e acentos', () => {
      const plaintext = 'José da Silva — RG: 12.345.678-X';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('deve lancar erro ao descriptografar dados corrompidos', () => {
      const encrypted = service.encrypt('12345678X');
      const corrupted = encrypted.slice(0, -4) + 'XXXX';

      expect(() => service.decrypt(corrupted)).toThrow();
    });

    it('deve lancar erro ao descriptografar com chave diferente', async () => {
      const encrypted = service.encrypt('12345678X');

      const otherKey = randomBytes(ENCRYPTION_CONFIG.KEY_LENGTH).toString('hex');
      const otherModule = await Test.createTestingModule({
        providers: [EncryptionService, { provide: ConfigService, useValue: buildConfigService(otherKey) }],
      }).compile();

      const otherService = otherModule.get(EncryptionService);

      expect(() => otherService.decrypt(encrypted)).toThrow();
    });
  });

  // ── hash ──────────────────────────────────────────────────────
  describe('hash', () => {
    it('deve retornar hash SHA-256 deterministico (hex 64 chars)', () => {
      const hash = service.hash('12345678X');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deve retornar o mesmo hash para o mesmo input', () => {
      const hash1 = service.hash('12345678X');
      const hash2 = service.hash('12345678X');

      expect(hash1).toBe(hash2);
    });

    it('deve retornar hashes diferentes para inputs diferentes', () => {
      const hash1 = service.hash('12345678X');
      const hash2 = service.hash('98765432Y');

      expect(hash1).not.toBe(hash2);
    });
  });

  // ── constructor ───────────────────────────────────────────────
  describe('constructor', () => {
    it('deve lancar erro se ENCRYPTION_KEY nao estiver definida', async () => {
      await expect(
        Test.createTestingModule({
          providers: [EncryptionService, { provide: ConfigService, useValue: buildConfigService(undefined) }],
        })
          .compile()
          .then((m) => m.get(EncryptionService)),
      ).rejects.toThrow('ENCRYPTION_KEY environment variable is not set');
    });

    it('deve lancar erro se ENCRYPTION_KEY tiver tamanho incorreto', async () => {
      await expect(
        Test.createTestingModule({
          providers: [EncryptionService, { provide: ConfigService, useValue: buildConfigService('abcd1234') }],
        })
          .compile()
          .then((m) => m.get(EncryptionService)),
      ).rejects.toThrow(`ENCRYPTION_KEY must be exactly ${ENCRYPTION_CONFIG.KEY_LENGTH} bytes`);
    });
  });
});
