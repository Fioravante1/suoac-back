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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly jwtExpiration: number;
  private readonly jwtRefreshExpiration: number;

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
    this.jwtRefreshExpiration = parseInt(this.configService.get<string>('JWT_REFRESH_EXPIRATION') ?? '604800', 10);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailForAuth(dto.email);

    if (!user || !user.isActive) {
      this.logger.warn(`Tentativa de login falhou — email="${dto.email}"`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (!user.passwordHash) {
      this.logger.warn(`Tentativa de login sem senha configurada — userId=${user.id}`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const isPasswordValid = await this.hashingService.verify(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      this.logger.warn(`Senha incorreta — userId=${user.id}`);
      throw new UnauthorizedException('Credenciais invalidas');
    }

    const tokens = await this.generateTokens(user);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashRefreshToken(tokens.refreshToken) },
    });

    this.logger.log(`Login bem-sucedido — userId=${user.id}`);

    return {
      ...tokens,
      user: this.toUserResponse(user),
    };
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<AuthResponse> {
    let payload: { sub: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(dto.refreshToken, {
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

    const tokens = await this.generateTokens(user);

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashRefreshToken(tokens.refreshToken) },
    });

    this.logger.log(`Tokens renovados — userId=${user.id}`);

    return {
      ...tokens,
      user: this.toUserResponse(user),
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.client.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    this.logger.log(`Logout — userId=${userId}`);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthResponse> {
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
    const updatedUser = { ...user, passwordHash: newPasswordHash, mustChangePassword: false };
    const tokens = await this.generateTokens(updatedUser);

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        refreshTokenHash: this.hashRefreshToken(tokens.refreshToken),
      },
    });

    this.logger.log(`Senha alterada — userId=${userId}`);

    void this.auditLogService
      .log('UPDATE', 'User', userId, userId, {
        oldValues: { mustChangePassword: user.mustChangePassword },
        newValues: { mustChangePassword: false },
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: userId }, 'Falha ao gravar audit log'));

    return {
      ...tokens,
      user: this.toUserResponse(updatedUser),
    };
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    role: string;
    circuitId: string;
    congregationId: string | null;
    mustChangePassword: boolean;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      circuitId: user.circuitId,
      congregationId: user.congregationId,
      mustChangePassword: user.mustChangePassword,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtExpiration,
      }),
      this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.jwtRefreshSecret,
          expiresIn: this.jwtRefreshExpiration,
        },
      ),
    ]);

    return { accessToken, refreshToken };
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
