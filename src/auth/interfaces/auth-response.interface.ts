import type { UserResponse } from '../../users/interfaces/user-response.interface';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** `true` quando o login marcou "manter conectado"; o BFF usa para decidir a persistência do cookie. */
  extendedSession: boolean;
  /** Tempo de vida do refresh token em segundos, para o BFF gravar o `maxAge` do cookie. */
  refreshExpiresIn: number;
  user: UserResponse;
}
