import * as crypto from 'crypto';
import { Injectable, Logger, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditLogService } from '../audit-log/audit-log.service';
import { HashingService } from '../common/hashing/hashing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UserResponse } from '../users/interfaces/user-response.interface';
import { UsersService } from '../users/users.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { AuthResponse } from './interfaces/auth-response.interface';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { SessionUser } from './interfaces/session-user.interface';

// Hash Argon2id válido (mesmos parâmetros do projeto) usado apenas para equalizar
// o tempo de resposta do login quando o usuário não existe / não tem senha,
// evitando enumeração de usuários por timing. Não corresponde a nenhuma senha real.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$UUeNV1VU3Ys5g15MkztWiw$EA9uTWeToONrxVCW6rzSJt6DW2YOFy2C52jXe8A/k5M';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiration: number;
  private readonly jwtRefreshExpiration: number;
  private readonly jwtExtendedRefreshExpiration: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    if (!jwtRefreshSecret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is not set');
    }

    this.jwtSecret = jwtSecret;
    this.jwtRefreshSecret = jwtRefreshSecret;
    this.jwtExpiration = parseInt(this.configService.get<string>('JWT_EXPIRATION') ?? '900', 10);
    this.jwtRefreshExpiration = this.readSeconds('JWT_REFRESH_EXPIRATION', '604800');
    this.jwtExtendedRefreshExpiration = this.readSeconds('JWT_EXTENDED_REFRESH_EXPIRATION', '2592000');
  }

  /** Lê uma duração em segundos e falha na subida se o valor não for um inteiro positivo. */
  private readSeconds(key: string, fallback: string): number {
    const seconds = parseInt(this.configService.get<string>(key) ?? fallback, 10);

    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new Error(`${key} must be a positive integer (seconds)`);
    }

    return seconds;
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailForAuth(dto.email);

    if (!user || !user.isActive || !user.passwordHash) {
      // Executa um verify "dummy" para que o tempo de resposta seja indistinguível
      // do caminho de senha incorreta, prevenindo enumeração de usuários por timing.
      await this.hashingService.verify(DUMMY_PASSWORD_HASH, dto.password).catch(() => false);
      this.logger.warn(`Tentativa de login falhou — email="${dto.email}"`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const isPasswordValid = await this.hashingService.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      this.logger.warn(`Senha incorreta — userId=${user.id}`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const session = await this.issueSession(user, { extended: dto.rememberMe ?? false });

    this.logger.log(`Login bem-sucedido — userId=${user.id}`);

    return session;
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<AuthResponse> {
    let payload: { sub: string; extended?: boolean };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; extended?: boolean }>(dto.refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const tokenHash = this.hashRefreshToken(dto.refreshToken);

    if (tokenHash !== user.refreshTokenHash) {
      this.logger.warn(`Refresh token reutilizado ou invalido — userId=${user.id}`);
      throw new UnauthorizedException('Refresh token invalido');
    }

    // A renovação preserva o modo da sessão: a marca viaja no próprio refresh token,
    // então a sessão estendida se renova como estendida e a padrão, como padrão.
    const session = await this.issueSession(user, { extended: payload.extended === true });

    this.logger.log(`Tokens renovados — userId=${user.id}`);

    return session;
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.client.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    this.logger.log(`Logout — userId=${userId}`);
  }

  async changePassword(userId: string, dto: ChangePasswordDto, extended = false): Promise<AuthResponse> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive || !user.passwordHash) {
      this.logger.warn(`Troca de senha falhou — usuário inválido userId=${userId}`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const isCurrentValid = await this.hashingService.verify(user.passwordHash, dto.currentPassword);

    if (!isCurrentValid) {
      this.logger.warn(`Senha atual incorreta na troca de senha — userId=${userId}`);
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const isSamePassword = await this.hashingService.verify(user.passwordHash, dto.newPassword);

    if (isSamePassword) {
      throw new UnprocessableEntityException('A nova senha deve ser diferente da atual');
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);

    // A troca de senha encerra as outras sessões. O incremento é feito pelo
    // banco e a versão nova é lida de volta da própria escrita: calcular
    // `user.sessionVersion + 1` em memória faria duas trocas concorrentes lerem
    // o mesmo valor e gravarem o mesmo incremento, e a segunda troca não
    // revogaria a sessão da primeira.
    const updatedUser = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });

    // O token nasce com a versão já incrementada, para a sessão que trocou a
    // senha continuar válida enquanto as demais caem no próximo request.
    const session = await this.issueSession(updatedUser, { extended });

    this.logger.log(`Senha alterada — userId=${userId}`);

    void this.auditLogService
      .log('UPDATE', 'User', userId, userId, {
        oldValues: { mustChangePassword: user.mustChangePassword },
        newValues: { mustChangePassword: false },
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: userId }, 'Falha ao gravar audit log'));

    return session;
  }

  /**
   * Abre uma sessão: emite o par de tokens e grava o hash do refresh.
   *
   * É o caminho único de nascimento de sessão — login, renovação, troca de senha
   * e autocadastro de circuito (SUC-37) passam por aqui, em vez de cada um
   * repetir a sequência de gerar, gravar e mapear.
   *
   * `extended` marca a sessão de "manter conectado" (SUC-39). A marca fica no
   * refresh token, nunca no `User`: assim ela vale só para o dispositivo que a
   * pediu e não vaza para as outras sessões do mesmo usuário.
   */
  async issueSession(user: SessionUser, options: { extended?: boolean } = {}): Promise<AuthResponse> {
    const extended = options.extended ?? false;
    const tokens = await this.generateTokens(user, extended);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashRefreshToken(tokens.refreshToken) },
    });

    return {
      ...tokens,
      extendedSession: extended,
      refreshExpiresIn: this.refreshTtl(extended),
      user: this.toUserResponse(user),
    };
  }

  private async generateTokens(
    user: {
      id: string;
      email: string;
      role: string;
      circuitId: string;
      congregationId: string | null;
      mustChangePassword: boolean;
      sessionVersion: number;
    },
    extended: boolean,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
      mustChangePassword: user.mustChangePassword,
      sessionVersion: user.sessionVersion,
      ...(extended && { extended }),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiration,
      }),
      this.jwtService.signAsync(extended ? { sub: user.id, extended: true } : { sub: user.id }, {
        secret: this.jwtRefreshSecret,
        expiresIn: this.refreshTtl(extended),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /** Única fonte do tempo de vida do refresh: o `exp` do token e o `maxAge` do cookie saem daqui. */
  private refreshTtl(extended: boolean): number {
    return extended ? this.jwtExtendedRefreshExpiration : this.jwtRefreshExpiration;
  }

  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private toUserResponse(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    mustChangePassword: boolean;
    circuitId: string;
    congregationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
