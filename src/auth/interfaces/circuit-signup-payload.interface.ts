/**
 * Cadastro guardado no rascunho, à espera da confirmação por código.
 *
 * Declarado como `type`, e não `interface`, de propósito: só um alias de objeto
 * ganha index signature implícita, e sem ela o Prisma recusa o valor na coluna
 * `Json` do `CircuitSignupRequest`.
 *
 * A senha aparece aqui **já em Argon2** — ela é hasheada na solicitação e nunca
 * mais trafega, nem de volta para o cliente.
 */
export type CircuitSignupPayload = {
  coordinator: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
  };
  circuit: {
    name: string;
    city: string;
    state: string;
  };
  /** A primeira é a congregação do próprio coordenador. A ordem é significativa. */
  congregations: {
    code: string;
    name: string;
  }[];
};
