import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_PASSWORD_CHANGE_KEY = 'allowWhilePasswordChange';

/**
 * Marca um handler como acessível mesmo quando o usuário ainda precisa trocar a senha
 * (mustChangePassword=true). Usado em rotas como change-password e logout, que devem
 * permanecer disponíveis durante o fluxo de troca obrigatória.
 */
export const AllowWhilePasswordChange = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOW_WHILE_PASSWORD_CHANGE_KEY, true);
