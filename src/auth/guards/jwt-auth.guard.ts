import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    this.jwtSecret = secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: JwtPayload }>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticacao ausente');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Token de autenticacao invalido');
    }

    await this.assertSessionIsCurrent(payload);
    request.user = payload;

    return true;
  }

  /**
   * Recusa o token emitido antes da última redefinição ou troca de senha.
   *
   * Custa uma consulta por request autenticado, e é esse o preço de invalidar
   * um access token roubado no instante da redefinição — sem ela, ele seguiria
   * aceito até expirar naturalmente, até 15 minutos depois.
   */
  private async assertSessionIsCurrent(payload: JwtPayload): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { sessionVersion: true },
    });

    if (!user) {
      throw new UnauthorizedException('Token de autenticacao invalido');
    }

    // Ausência vale 0: tokens emitidos antes do campo existir continuam válidos
    // enquanto o usuário não trocar de senha.
    if ((payload.sessionVersion ?? 0) < user.sessionVersion) {
      throw new UnauthorizedException('Sessao encerrada. Entre novamente.');
    }
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return undefined;
    }
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
