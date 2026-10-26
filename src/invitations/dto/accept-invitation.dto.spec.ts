import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptInvitationDto } from './accept-invitation.dto';

// ── Helpers ──────────────────────────────────────────────────────
function buildRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: 'Maria Souza', phone: '11987654321', password: 'Senha123', ...overrides };
}

/** Mensagens de erro por campo, para a asserção ficar legível. */
async function messagesByField(raw: Record<string, unknown>): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(AcceptInvitationDto, raw));

  return Object.fromEntries(errors.map((error) => [error.property, Object.values(error.constraints ?? {})]));
}

// ── Test Suite ───────────────────────────────────────────────────
describe('AcceptInvitationDto', () => {
  describe('nome', () => {
    it('deve colapsar os espaços e aceitar nome e sobrenome', async () => {
      const raw = buildRaw({ name: '  Maria   de  Souza ' });

      expect(plainToInstance(AcceptInvitationDto, raw).name).toBe('Maria de Souza');
      expect(await messagesByField(raw)).not.toHaveProperty('name');
    });

    it('deve exigir nome e sobrenome, com a mensagem de sempre', async () => {
      expect((await messagesByField(buildRaw({ name: 'Maria' }))).name).toContain('Informe nome e sobrenome');
    });

    it.each([
      ['curto', 'A'],
      ['longo', `x ${'y'.repeat(150)}`],
    ])('deve recusar nome %s', async (_case, name) => {
      expect(await messagesByField(buildRaw({ name }))).toHaveProperty('name');
    });
  });

  describe('celular', () => {
    it.each([
      ['(11) 98765-4321', '11987654321'],
      ['11 98765-4321', '11987654321'],
      ['1133334444', '1133334444'],
    ])('deve tirar a máscara de %s e aceitar', async (phone, expected) => {
      const raw = buildRaw({ phone });

      expect(plainToInstance(AcceptInvitationDto, raw).phone).toBe(expected);
      expect(await messagesByField(raw)).not.toHaveProperty('phone');
    });

    it.each(['(11) 9876', '119876543210', 'sem número', ''])(
      'deve recusar o celular %j, com a mensagem de sempre',
      async (phone) => {
        expect((await messagesByField(buildRaw({ phone }))).phone).toContain('O celular deve ter DDD e 8 ou 9 dígitos');
      },
    );

    it('deve recusar o celular que não é texto', async () => {
      expect(await messagesByField(buildRaw({ phone: 11987654321 }))).toHaveProperty('phone');
    });
  });

  it('não deve ter erros no payload válido', async () => {
    expect(await messagesByField(buildRaw())).toEqual({});
  });
});
