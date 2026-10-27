import { parseCircuitSignupPayload } from './circuit-signup-payload.parser';

// ── Helpers ──────────────────────────────────────────────────────
function buildRawPayload(): Record<string, unknown> {
  return {
    coordinator: {
      name: 'João Silva',
      email: 'joao@example.com',
      phone: '11987654321',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$fake$hash',
    },
    circuit: { name: 'SP-17', city: 'São Paulo', state: 'SP' },
    congregations: [
      { code: 'SP17-CENTRAL', name: 'Central' },
      { code: 'SP17-JARDIM', name: 'Jardim' },
    ],
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('parseCircuitSignupPayload', () => {
  it('deve reconstruir o payload completo', () => {
    const result = parseCircuitSignupPayload(buildRawPayload());

    expect(result.coordinator.email).toBe('joao@example.com');
    expect(result.circuit.name).toBe('SP-17');
    expect(result.congregations).toHaveLength(2);
  });

  it('deve aceitar o identificador com sufixo', () => {
    const raw = buildRawPayload();
    (raw.circuit as Record<string, unknown>).name = 'SP-019 A';

    expect(parseCircuitSignupPayload(raw).circuit.name).toBe('SP-019 A');
  });

  it('deve ignorar um code legado, sem usá-lo no lugar do name', () => {
    const raw = buildRawPayload();
    (raw.circuit as Record<string, unknown>).code = 'OUTRO-1';

    const result = parseCircuitSignupPayload(raw);

    expect(result.circuit.name).toBe('SP-17');
    expect(result.circuit).not.toHaveProperty('code');
  });

  it('deve preservar a ordem das congregacoes', () => {
    const result = parseCircuitSignupPayload(buildRawPayload());

    // A primeira é a congregação do próprio coordenador: trocar a ordem ligaria
    // o usuário à congregação errada.
    expect(result.congregations[0]?.code).toBe('SP17-CENTRAL');
    expect(result.congregations[1]?.code).toBe('SP17-JARDIM');
  });

  it('deve descartar campos que nao fazem parte do formato', () => {
    const raw = { ...buildRawPayload(), lixo: 'ignorado' };

    const result = parseCircuitSignupPayload(raw);

    expect(result).not.toHaveProperty('lixo');
  });

  it.each([
    ['nulo', null],
    ['string', 'nao e objeto'],
    ['array', []],
    ['vazio', {}],
  ])('deve lancar quando o payload e %s', (_label, value) => {
    expect(() => parseCircuitSignupPayload(value)).toThrow(/Rascunho de autocadastro inválido/);
  });

  it('deve lancar quando o coordenador nao tem senha hasheada', () => {
    const raw = buildRawPayload();
    const coordinator = raw.coordinator as Record<string, unknown>;
    delete coordinator.passwordHash;

    // Sem o hash, o usuário nasceria sem senha e sem como entrar.
    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.coordinator\.passwordHash/);
  });

  it('deve lancar quando a lista de congregacoes esta vazia', () => {
    const raw = { ...buildRawPayload(), congregations: [] };

    // Não há congregação do coordenador para ligar ao usuário.
    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.congregations/);
  });

  it('deve apontar o indice da congregacao invalida', () => {
    const raw = { ...buildRawPayload(), congregations: [{ code: 'SP17-CENTRAL', name: 'Central' }, { code: 'X' }] };

    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.congregations\[1\]\.name/);
  });

  it('deve lancar quando um campo vem como string vazia', () => {
    const raw = buildRawPayload();
    (raw.circuit as Record<string, unknown>).name = '';

    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.circuit\.name/);
  });

  it('deve lancar quando um campo vem com o tipo errado', () => {
    const raw = buildRawPayload();
    (raw.circuit as Record<string, unknown>).state = 42;

    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.circuit\.state/);
  });

  describe('aceite dos termos', () => {
    it('deve reconstruir o aceite quando o rascunho o traz', () => {
      const raw = { ...buildRawPayload(), terms: { version: '2026-10-25', acceptedAt: '2026-10-25T12:00:00.000Z' } };

      expect(parseCircuitSignupPayload(raw).terms).toEqual({
        version: '2026-10-25',
        acceptedAt: '2026-10-25T12:00:00.000Z',
      });
    });

    it('deve aceitar rascunho sem o aceite, de antes do campo existir', () => {
      expect(parseCircuitSignupPayload(buildRawPayload()).terms).toBeUndefined();
    });

    it.each([
      ['version', { version: '9999-99-99', acceptedAt: '2026-10-25T12:00:00.000Z' }],
      ['acceptedAt', { version: '2026-10-25', acceptedAt: 'ontem' }],
    ])('deve lancar quando %s do aceite é inválido', (field, terms) => {
      expect(() => parseCircuitSignupPayload({ ...buildRawPayload(), terms })).toThrow(
        new RegExp(`payload\\.terms\\.${field}`),
      );
    });

    it('deve lancar quando o aceite vem incompleto', () => {
      const raw = { ...buildRawPayload(), terms: { version: '2026-10-25' } };

      expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.terms\.acceptedAt/);
    });
  });
});
