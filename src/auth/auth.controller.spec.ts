import { BadRequestException, ConflictException, GoneException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { UserResponse } from '../users/interfaces/user-response.interface';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthResponse } from './interfaces/auth-response.interface';
import { PasswordResetService } from './password-reset.service';

// ── Constants ────────────────────────────────────────────────────
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────
function buildUserResponse(): UserResponse {
  return {
    id: USER_ID,
    name: 'João Silva',
    email: 'joao@example.com',
    role: 'CIRCUIT_COORDINATOR',
    isActive: true,
    mustChangePassword: false,
    circuitId: CIRCUIT_ID,
    congregationId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildAuthResponse(): AuthResponse {
  return {
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    user: buildUserResponse(),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('AuthController', () => {
  let controller: AuthController;
  let serviceMock: jest.Mocked<Pick<AuthService, 'login' | 'refreshTokens' | 'logout' | 'changePassword'>>;
  let passwordResetMock: jest.Mocked<Pick<PasswordResetService, 'requestReset' | 'verifyToken' | 'resetPassword'>>;

  beforeEach(async () => {
    serviceMock = {
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
    };

    passwordResetMock = {
      requestReset: jest.fn(),
      verifyToken: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: serviceMock },
        { provide: PasswordResetService, useValue: passwordResetMock },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  // ── login ──────────────────────────────────────────────────────
  describe('login', () => {
    const dto = { email: 'joao@example.com', password: 'Senh@123!' };

    it('deve delegar ao service e retornar AuthResponse', async () => {
      const expected = buildAuthResponse();
      serviceMock.login.mockResolvedValue(expected);

      const result = await controller.login(dto);

      expect(result).toEqual(expected);
      expect(serviceMock.login).toHaveBeenCalledWith(dto);
    });

    it('deve propagar UnauthorizedException do service', async () => {
      serviceMock.login.mockRejectedValue(new UnauthorizedException('Credenciais invalidas'));

      await expect(controller.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refresh ────────────────────────────────────────────────────
  describe('refresh', () => {
    const dto = { refreshToken: 'some-refresh-token' };

    it('deve delegar ao service e retornar AuthResponse', async () => {
      const expected = buildAuthResponse();
      serviceMock.refreshTokens.mockResolvedValue(expected);

      const result = await controller.refresh(dto);

      expect(result).toEqual(expected);
      expect(serviceMock.refreshTokens).toHaveBeenCalledWith(dto);
    });

    it('deve propagar UnauthorizedException do service', async () => {
      serviceMock.refreshTokens.mockRejectedValue(new UnauthorizedException('Refresh token invalido'));

      await expect(controller.refresh(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ─────────────────────────────────────────────────────
  describe('logout', () => {
    it('deve delegar ao service com userId do @CurrentUser', async () => {
      serviceMock.logout.mockResolvedValue(undefined);

      await controller.logout(USER_ID);

      expect(serviceMock.logout).toHaveBeenCalledWith(USER_ID);
    });

    it('deve retornar undefined (204 No Content)', async () => {
      serviceMock.logout.mockResolvedValue(undefined);

      const result = await controller.logout(USER_ID);

      expect(result).toBeUndefined();
    });

    it('deve propagar erro do service', async () => {
      serviceMock.logout.mockRejectedValue(new Error('Unexpected error'));

      await expect(controller.logout(USER_ID)).rejects.toThrow('Unexpected error');
    });
  });

  // ── changePassword ─────────────────────────────────────────────
  describe('changePassword', () => {
    const dto = { currentPassword: '80275@Suoac', newPassword: 'NovaSenha@123' };

    it('deve delegar ao service com userId do @CurrentUser e retornar AuthResponse', async () => {
      const expected = buildAuthResponse();
      serviceMock.changePassword.mockResolvedValue(expected);

      const result = await controller.changePassword(USER_ID, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.changePassword).toHaveBeenCalledWith(USER_ID, dto);
    });

    it('deve propagar UnauthorizedException do service', async () => {
      serviceMock.changePassword.mockRejectedValue(new UnauthorizedException('Senha atual incorreta'));

      await expect(controller.changePassword(USER_ID, dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── requestPasswordReset ───────────────────────────────────────
  describe('requestPasswordReset', () => {
    const dto = { email: 'joao@example.com' };

    it('deve delegar ao service e nao retornar conteudo', async () => {
      passwordResetMock.requestReset.mockResolvedValue(undefined);

      const result = await controller.requestPasswordReset(dto);

      expect(result).toBeUndefined();
      expect(passwordResetMock.requestReset).toHaveBeenCalledWith(dto);
    });
  });

  // ── verifyPasswordResetToken ───────────────────────────────────
  describe('verifyPasswordResetToken', () => {
    const dto = { token: 'a'.repeat(64) };

    it('deve delegar ao service quando o token e valido', async () => {
      passwordResetMock.verifyToken.mockResolvedValue(undefined);

      const result = await controller.verifyPasswordResetToken(dto);

      expect(result).toBeUndefined();
      expect(passwordResetMock.verifyToken).toHaveBeenCalledWith(dto);
    });

    it('deve propagar GoneException de token expirado', async () => {
      passwordResetMock.verifyToken.mockRejectedValue(new GoneException('Token de recuperacao expirado'));

      await expect(controller.verifyPasswordResetToken(dto)).rejects.toThrow(GoneException);
    });

    it('deve propagar ConflictException de token ja utilizado', async () => {
      passwordResetMock.verifyToken.mockRejectedValue(new ConflictException('Token de recuperacao ja utilizado'));

      await expect(controller.verifyPasswordResetToken(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── resetPassword ──────────────────────────────────────────────
  describe('resetPassword', () => {
    const dto = { token: 'a'.repeat(64), newPassword: 'NovaSenha@123' };

    it('deve delegar ao service e nao retornar conteudo', async () => {
      passwordResetMock.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword(dto);

      expect(result).toBeUndefined();
      expect(passwordResetMock.resetPassword).toHaveBeenCalledWith(dto);
    });

    it('deve propagar BadRequestException de token invalido', async () => {
      passwordResetMock.resetPassword.mockRejectedValue(new BadRequestException('Token de recuperacao invalido'));

      await expect(controller.resetPassword(dto)).rejects.toThrow(BadRequestException);
    });
  });
});
