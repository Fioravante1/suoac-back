import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCircuitSignupDto } from './create-circuit-signup.dto';

// ── Helpers ──────────────────────────────────────────────────────
function buildRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    coordinator: {
      name: 'João Silva',
      email: 'joao@example.com',
      phone: '11987654321',
      password: 'Senha-Segura123',
    },
    circuit: { name: 'SP-17', city: 'São Paulo', state: 'SP' },
    congregations: [{ code: 'SP17-CENTRAL', name: 'Central' }],
    ...overrides,
  };
}

/** Caminhos dos campos que falharam, achatados, para a asserção ficar legível. */
async function failedFields(raw: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateCircuitSignupDto, raw);
  const errors = await validate(dto);

  return errors.flatMap((error) => (error.children ?? []).map((child) => `${error.property}.${child.property}`));
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CreateCircuitSignupDto', () => {
  describe('normalização', () => {
    it('deve passar o circuito para maiúsculas', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { name: ' sp-17 ', city: 'Y', state: 'sp' } }),
      );

      expect(dto.circuit.name).toBe('SP-17');
    });

    it('deve normalizar o alias legado quando ele vier no payload', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { code: ' sp-17 ', name: 'Circuito São Paulo 17', city: 'Y', state: 'sp' } }),
      );

      expect(dto.circuit.code).toBe('SP-17');
    });

    it('deve passar a UF para maiúsculas', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { name: 'SP-17', city: 'Y', state: 'sp' } }),
      );

      expect(dto.circuit.state).toBe('SP');
    });

    it('deve passar o e-mail para minúsculas', () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).email = 'Joao@Example.COM';

      const dto = plainToInstance(CreateCircuitSignupDto, raw);

      expect(dto.coordinator.email).toBe('joao@example.com');
    });

    it('deve guardar apenas os dígitos do celular', () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).phone = '(11) 98765-4321';

      // A máscara é apresentação: guardar a formatação tornaria qualquer
      // comparação futura dependente dela.
      const dto = plainToInstance(CreateCircuitSignupDto, raw);

      expect(dto.coordinator.phone).toBe('11987654321');
    });

    it('deve aparar espaços em volta dos nomes', () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).name = '  João Silva  ';

      const dto = plainToInstance(CreateCircuitSignupDto, raw);

      expect(dto.coordinator.name).toBe('João Silva');
    });

    it('deve passar o código das congregações para maiúsculas', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ congregations: [{ code: 'sp17-central', name: 'Central' }] }),
      );

      expect(dto.congregations[0]?.code).toBe('SP17-CENTRAL');
    });
  });

  describe('validação', () => {
    it('não deve ter erros no payload válido', async () => {
      const dto = plainToInstance(CreateCircuitSignupDto, buildRaw());
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('deve aceitar celular de 10 dígitos, sem o nono', async () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).phone = '1133334444';

      const dto = plainToInstance(CreateCircuitSignupDto, raw);

      expect(await validate(dto)).toHaveLength(0);
    });

    it('deve recusar celular com dígitos insuficientes', async () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).phone = '98765432';

      expect(await failedFields(raw)).toContain('coordinator.phone');
    });

    it('deve aceitar o nome do coordenador sem sobrenome: a exigência de sobrenome é só do convite', async () => {
      const raw = buildRaw({ coordinator: { ...(buildRaw().coordinator as object), name: 'Maria' } });

      expect(await failedFields(raw)).not.toContain('coordinator.name');
    });

    it('deve apenas aparar o nome do coordenador, sem colapsar os espaços do meio', () => {
      const raw = buildRaw({ coordinator: { ...(buildRaw().coordinator as object), name: '  Maria   Souza  ' } });

      expect(plainToInstance(CreateCircuitSignupDto, raw).coordinator.name).toBe('Maria   Souza');
    });

    it.each([
      ['vazio', '   '],
      ['curto', 'A'],
      ['longo', 'x'.repeat(151)],
    ])('deve recusar o nome do coordenador %s', async (_case, name) => {
      const raw = buildRaw({ coordinator: { ...(buildRaw().coordinator as object), name } });

      expect(await failedFields(raw)).toContain('coordinator.name');
    });

    it('deve recusar senha sem maiúscula, minúscula e número', async () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).password = 'senhasenha';

      expect(await failedFields(raw)).toContain('coordinator.password');
    });

    it('deve recusar senha com menos de 8 caracteres', async () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).password = 'Senha1';

      expect(await failedFields(raw)).toContain('coordinator.password');
    });

    it('deve recusar e-mail malformado', async () => {
      const raw = buildRaw();
      (raw.coordinator as Record<string, unknown>).email = 'joao@';

      expect(await failedFields(raw)).toContain('coordinator.email');
    });

    it('deve recusar UF que não tenha duas letras', async () => {
      expect(await failedFields(buildRaw({ circuit: { name: 'SP-17', city: 'Y', state: 'SAO' } }))).toContain(
        'circuit.state',
      );
    });

    it('deve aceitar o formato real de circuito com espaço', async () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { name: 'SP-019 A', city: 'Campinas', state: 'SP' } }),
      );

      expect(await validate(dto)).toHaveLength(0);
    });

    it('deve aceitar o nome descritivo longo enviado junto do alias legado', async () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({
          circuit: {
            code: 'SP-17',
            name: 'Circuito Metropolitano de São Paulo Dezessete',
            city: 'São Paulo',
            state: 'SP',
          },
        }),
      );

      expect(await validate(dto)).toHaveLength(0);
    });

    it('deve recusar o alias legado com caracteres fora do padrão', async () => {
      expect(
        await failedFields(
          buildRaw({ circuit: { code: 'SP 17!', name: 'Circuito São Paulo 17', city: 'Y', state: 'SP' } }),
        ),
      ).toContain('circuit.code');
    });

    it('deve exigir o circuito no campo canonico', async () => {
      expect(await failedFields(buildRaw({ circuit: { name: '', city: 'Y', state: 'SP' } }))).toContain('circuit.name');
    });

    it('deve recusar circuito acima de 20 caracteres durante a compatibilidade', async () => {
      expect(
        await failedFields(buildRaw({ circuit: { name: 'CIRCUITO-COM-MAIS-DE-20', city: 'Y', state: 'SP' } })),
      ).toContain('circuit.name');
    });

    it('deve exigir ao menos uma congregação', async () => {
      const dto = plainToInstance(CreateCircuitSignupDto, buildRaw({ congregations: [] }));
      const errors = await validate(dto);

      // A primeira congregação é a do próprio coordenador — sem ela, o usuário
      // nasceria sem congregação nenhuma.
      expect(errors.map((error) => error.property)).toContain('congregations');
    });

    it('deve recusar congregação sem código', async () => {
      const dto = plainToInstance(CreateCircuitSignupDto, buildRaw({ congregations: [{ name: 'Central' }] }));
      const errors = await validate(dto);

      expect(errors).not.toHaveLength(0);
    });
  });

  describe('versão dos termos', () => {
    async function topLevelFailures(raw: Record<string, unknown>): Promise<string[]> {
      const errors = await validate(plainToInstance(CreateCircuitSignupDto, raw));

      return errors.map((error) => error.property);
    }

    it('deve aceitar o payload sem a versão, enquanto o campo é opcional', async () => {
      expect(await topLevelFailures(buildRaw())).not.toContain('termsVersion');
    });

    it('deve aceitar a versão no formato AAAA-MM-DD', async () => {
      expect(await topLevelFailures(buildRaw({ termsVersion: '2026-10-25' }))).not.toContain('termsVersion');
    });

    it.each(['25/10/2026', '9999-99-99', '2026-02-30', '2026-10', '2026-10-25T00:00:00Z', '', 20261025])(
      'deve recusar a versão %j',
      async (termsVersion) => {
        expect(await topLevelFailures(buildRaw({ termsVersion }))).toContain('termsVersion');
      },
    );
  });
});
