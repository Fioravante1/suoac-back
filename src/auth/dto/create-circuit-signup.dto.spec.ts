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
      password: 'Senha123',
    },
    circuit: { code: 'SP-17', name: 'Circuito São Paulo 17', city: 'São Paulo', state: 'SP' },
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
    it('deve passar o código do circuito para maiúsculas', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { code: ' sp-17 ', name: 'X', city: 'Y', state: 'sp' } }),
      );

      // `sp-17` e `SP-17` precisam ser o mesmo circuito, senão a unicidade do
      // código não vale nada.
      expect(dto.circuit.code).toBe('SP-17');
    });

    it('deve passar a UF para maiúsculas', () => {
      const dto = plainToInstance(
        CreateCircuitSignupDto,
        buildRaw({ circuit: { code: 'SP-17', name: 'X', city: 'Y', state: 'sp' } }),
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
      expect(
        await failedFields(buildRaw({ circuit: { code: 'SP-17', name: 'X', city: 'Y', state: 'SAO' } })),
      ).toContain('circuit.state');
    });

    it('deve recusar código de circuito com caracteres fora do padrão', async () => {
      expect(
        await failedFields(buildRaw({ circuit: { code: 'SP 17!', name: 'X', city: 'Y', state: 'SP' } })),
      ).toContain('circuit.code');
    });

    it('deve exigir o nome do circuito', async () => {
      // Divergência deliberada do protótipo, registrada em SUC-30: o circuito
      // tem código e nome, e o nome é obrigatório.
      expect(await failedFields(buildRaw({ circuit: { code: 'SP-17', name: '', city: 'Y', state: 'SP' } }))).toContain(
        'circuit.name',
      );
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
});
