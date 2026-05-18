import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HashingService } from './hashing.service';

const TEST_PEPPER = 'test-pepper-32-bytes-for-tests!';

function buildConfigService(pepper: string | undefined): Partial<ConfigService> {
  return {
    get: jest.fn().mockReturnValue(pepper),
  };
}

describe('HashingService', () => {
  let service: HashingService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [HashingService, { provide: ConfigService, useValue: buildConfigService(TEST_PEPPER) }],
    }).compile();

    service = module.get(HashingService);
  });

  describe('hash', () => {
    it('deve retornar um hash argon2id valido', async () => {
      const hash = await service.hash('MinhaSenh@123');

      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('deve gerar hashes diferentes para a mesma senha (salt aleatorio)', async () => {
      const hash1 = await service.hash('MinhaSenh@123');
      const hash2 = await service.hash('MinhaSenh@123');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verify', () => {
    it('deve retornar true para senha correta', async () => {
      const hash = await service.hash('MinhaSenh@123');

      const result = await service.verify(hash, 'MinhaSenh@123');

      expect(result).toBe(true);
    });

    it('deve retornar false para senha incorreta', async () => {
      const hash = await service.hash('MinhaSenh@123');

      const result = await service.verify(hash, 'SenhaErrada');

      expect(result).toBe(false);
    });

    it('deve retornar false para senha com pepper diferente', async () => {
      const hash = await service.hash('MinhaSenh@123');

      // Cria outro service com pepper diferente
      const module = await Test.createTestingModule({
        providers: [HashingService, { provide: ConfigService, useValue: buildConfigService('outro-pepper-totalmente-diferente') }],
      }).compile();

      const otherService = module.get(HashingService);
      const result = await otherService.verify(hash, 'MinhaSenh@123');

      expect(result).toBe(false);
    });
  });

  describe('constructor', () => {
    it('deve lancar erro se PASSWORD_PEPPER nao estiver definida', async () => {
      await expect(
        Test.createTestingModule({
          providers: [HashingService, { provide: ConfigService, useValue: buildConfigService(undefined) }],
        })
          .compile()
          .then((m) => m.get(HashingService)),
      ).rejects.toThrow('PASSWORD_PEPPER environment variable is not set');
    });
  });
});
