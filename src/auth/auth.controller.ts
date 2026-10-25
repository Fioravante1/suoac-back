import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CircuitSignupService } from './circuit-signup.service';
import { AllowWhilePasswordChange } from './decorators/allow-while-password-change.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfirmCircuitSignupDto } from './dto/confirm-circuit-signup.dto';
import { CreateCircuitSignupDto } from './dto/create-circuit-signup.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetVerificationDto } from './dto/password-reset-verification.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import type { AuthResponse } from './interfaces/auth-response.interface';
import { PasswordResetService } from './password-reset.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly circuitSignupService: CircuitSignupService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refreshTokens(dto);
  }

  @AllowWhilePasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('sub') userId: string, @CurrentUser('sid') sessionId?: string): Promise<void> {
    return this.authService.logout(userId, sessionId);
  }

  @AllowWhilePasswordChange()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser('extended') extended?: boolean,
  ): Promise<AuthResponse> {
    return this.authService.changePassword(userId, dto, extended === true);
  }

  /**
   * Responde sempre `204`, exista ou não a conta: status, corpo e tempo de
   * resposta iguais impedem usar o endpoint para descobrir e-mails cadastrados.
   */
  @Public()
  @Post('password-reset-requests')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    return this.passwordResetService.requestReset(dto);
  }

  /** Estado do token sem consumi-lo: `204` válido, `400`/`409`/`410` nos demais. */
  @Public()
  @Post('password-reset-verifications')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyPasswordResetToken(@Body() dto: PasswordResetVerificationDto): Promise<void> {
    return this.passwordResetService.verifyToken(dto);
  }

  @Public()
  @Post('password-resets')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.passwordResetService.resetPassword(dto);
  }

  /**
   * Guarda o rascunho do autocadastro e envia o código de confirmação. Responde
   * `202`, e não `201`: nada foi criado ainda — circuito, congregações e
   * coordenador nascem só na confirmação.
   *
   * Chamar de novo com o mesmo payload é o "reenviar" da tela.
   */
  @Public()
  @Post('circuit-signups')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestCircuitSignup(@Body() dto: CreateCircuitSignupDto): Promise<void> {
    return this.circuitSignupService.requestSignup(dto);
  }

  /** Consolida o cadastro e devolve sessão autenticada para a tela de sucesso. */
  @Public()
  @Post('circuit-signups/confirmations')
  @HttpCode(HttpStatus.CREATED)
  async confirmCircuitSignup(@Body() dto: ConfirmCircuitSignupDto): Promise<AuthResponse> {
    return this.circuitSignupService.confirmSignup(dto);
  }
}
