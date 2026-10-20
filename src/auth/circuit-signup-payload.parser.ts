import type { CircuitSignupPayload } from './interfaces/circuit-signup-payload.interface';

/**
 * Reconstrói o payload lido da coluna `Json` do rascunho.
 *
 * O Prisma devolve `JsonValue`, não o tipo que foi gravado — a coluna não tem
 * schema. Em vez de um cast, que afirmaria uma forma sem verificá-la, cada campo
 * é conferido aqui. Falha significa rascunho corrompido ou gravado por uma
 * versão anterior com outro formato: é erro de servidor, não do usuário, e quem
 * chama traduz para `500`.
 */
export function parseCircuitSignupPayload(value: unknown): CircuitSignupPayload {
  const root = asRecord(value, 'payload');
  const coordinator = asRecord(root.coordinator, 'payload.coordinator');
  const circuit = asRecord(root.circuit, 'payload.circuit');

  if (!Array.isArray(root.congregations) || root.congregations.length === 0) {
    throw new Error('Rascunho de autocadastro inválido: payload.congregations');
  }

  return {
    coordinator: {
      name: asString(coordinator.name, 'payload.coordinator.name'),
      email: asString(coordinator.email, 'payload.coordinator.email'),
      phone: asString(coordinator.phone, 'payload.coordinator.phone'),
      passwordHash: asString(coordinator.passwordHash, 'payload.coordinator.passwordHash'),
    },
    circuit: {
      code: asString(circuit.code, 'payload.circuit.code'),
      name: asString(circuit.name, 'payload.circuit.name'),
      city: asString(circuit.city, 'payload.circuit.city'),
      state: asString(circuit.state, 'payload.circuit.state'),
    },
    congregations: root.congregations.map((item, index) => {
      const congregation = asRecord(item, `payload.congregations[${index}]`);

      return {
        code: asString(congregation.code, `payload.congregations[${index}].code`),
        name: asString(congregation.name, `payload.congregations[${index}].name`),
      };
    }),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Rascunho de autocadastro inválido: ${path}`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Rascunho de autocadastro inválido: ${path}`);
  }

  return value;
}
