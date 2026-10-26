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

/** Teto de dispositivos simultâneos por usuário: ao passar, as sessões menos usadas caem (SUC-77). */
const MAX_SESSIONS_PER_USER = 10;

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
    let payload: { sub: string; sid?: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; sid?: string }>(dto.refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    // Refresh emitido antes das sessões por dispositivo (SUC-77) não traz `sid`:
    // não há linha para ele, e a pessoa entra de novo uma vez.
    if (!payload.sid) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const session = await this.prisma.client.session.findFirst({
      where: { id: payload.sid, userId: payload.sub },
      include: { user: true },
    });

    if (!session || !session.user.isActive || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    if (this.hashRefreshToken(dto.refreshToken) !== session.refreshTokenHash) {
      // Só recusa, sem apagar a sessão: duas abas que renovam juntas apresentam o
      // mesmo token, e a perdedora não pode derrubar a sessão que a vencedora acabou de rotacionar.
      this.logger.warn(`Refresh token reutilizado ou invalido — userId=${session.userId} sessionId=${session.id}`);
      throw new UnauthorizedException('Refresh token invalido');
    }

    // A renovação preserva o modo da sessão, guardado na própria linha.
    const issued = await this.rotateSession(session.user, session);

    this.logger.log(`Tokens renovados — userId=${session.userId} sessionId=${session.id}`);

    return issued;
  }

  /** Encerra só a sessão de quem saiu; as dos outros dispositivos seguem abertas. */
  async logout(userId: string, sessionId?: string): Promise<void> {
    // Access token emitido antes das sessões por dispositivo não traz `sid`, e a
    // sessão dele nem existe na tabela: não há o que apagar.
    if (sessionId) {
      await this.prisma.client.session.deleteMany({ where: { id: sessionId, userId } });
    }

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
    //
    // Todas as sessões são apagadas, a de quem trocou a senha inclusive: ela é
    // reaberta logo abaixo, com tokens novos e no mesmo modo (`extended`).
    const [updatedUser] = await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      }),
      this.prisma.client.session.deleteMany({ where: { userId } }),
    ]);

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
   * Abre uma sessão nova: uma linha em `sessions` e o par de tokens.
   *
   * É o caminho de nascimento de sessão — login, troca de senha, convite e
   * autocadastro de circuito (SUC-37) passam por aqui. A renovação usa
   * `rotateSession`, que mantém a linha.
   *
   * `extended` marca a sessão de "manter conectado" (SUC-39) e define a duração
   * do refresh token. Fica na linha da sessão, nunca no `User`: vale só para o
   * dispositivo que a pediu e não vaza para as outras sessões do mesmo usuário.
   */
  async issueSession(user: SessionUser, options: { extended?: boolean } = {}): Promise<AuthResponse> {
    const extended = options.extended ?? false;
    const sessionId = crypto.randomUUID();
    const tokens = await this.generateTokens(user, sessionId, extended);

    await this.prisma.client.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(tokens.refreshToken),
        extended,
        expiresAt: this.sessionExpiry(extended),
      },
    });

    await this.pruneSessions(user.id);

    return this.toAuthResponse(user, tokens, extended);
  }

  /** Troca os tokens da sessão existente. Dois refresh simultâneos com o mesmo token: só um vence. */
  private async rotateSession(
    user: SessionUser,
    session: { id: string; refreshTokenHash: string; extended: boolean },
  ): Promise<AuthResponse> {
    const tokens = await this.generateTokens(user, session.id, session.extended);

    const { count } = await this.prisma.client.session.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash },
      data: {
        refreshTokenHash: this.hashRefreshToken(tokens.refreshToken),
        expiresAt: this.sessionExpiry(session.extended),
        lastUsedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    return this.toAuthResponse(user, tokens, session.extended);
  }

  /** Apaga as sessões vencidas e, passando do teto, as menos usadas. */
  private async pruneSessions(userId: string): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });

    const surplus = await this.prisma.client.session.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_SESSIONS_PER_USER,
      select: { id: true },
    });

    if (surplus.length === 0) {
      return;
    }

    await this.prisma.client.session.deleteMany({ where: { id: { in: surplus.map(({ id }) => id) } } });
  }

  private sessionExpiry(extended: boolean): Date {
    return new Date(Date.now() + this.refreshTtl(extended) * 1000);
  }

  private toAuthResponse(
    user: SessionUser,
    tokens: { accessToken: string; refreshToken: string },
    extended: boolean,
  ): AuthResponse {
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
    sessionId: string,
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
      sid: sessionId,
      ...(extended && { extended }),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiration,
      }),
      this.jwtService.signAsync(
        // `jti` aleatório: sem ele, dois tokens da mesma sessão assinados no mesmo segundo
        // seriam idênticos, e a rotação não mudaria o hash.
        { sub: user.id, sid: sessionId, jti: crypto.randomUUID() },
        {
          secret: this.jwtRefreshSecret,
          expiresIn: this.refreshTtl(extended),
        },
      ),
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
