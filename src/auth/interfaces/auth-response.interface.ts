import type { UserResponse } from '../../users/interfaces/user-response.interface';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
}
