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
    circuit: { code: 'SP-17', name: 'Circuito São Paulo 17', city: 'São Paulo', state: 'SP' },
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
    expect(result.circuit.code).toBe('SP-17');
    expect(result.congregations).toHaveLength(2);
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
    (raw.circuit as Record<string, unknown>).code = '';

    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.circuit\.code/);
  });

  it('deve lancar quando um campo vem com o tipo errado', () => {
    const raw = buildRawPayload();
    (raw.circuit as Record<string, unknown>).state = 42;

    expect(() => parseCircuitSignupPayload(raw)).toThrow(/payload\.circuit\.state/);
  });
});
