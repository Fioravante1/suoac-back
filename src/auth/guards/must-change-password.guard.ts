import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ALLOW_WHILE_PASSWORD_CHANGE_KEY } from '../decorators/allow-while-password-change.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Bloqueia o acesso a todas as rotas enquanto o usuário precisa trocar a senha
 * (mustChangePassword=true), exceto rotas públicas ou marcadas com @AllowWhilePasswordChange().
 *
 * A flag é lida do JwtPayload (token), evitando uma query ao banco por requisição.
 * O endpoint de troca de senha emite novos tokens com a flag zerada (rotation),
 * liberando o acesso imediatamente sem esperar o token anterior expirar.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isAllowed = this.reflector.getAllAndOverride<boolean>(ALLOW_WHILE_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isAllowed) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: JwtPayload }>();
    const user = request.user;

    if (user?.mustChangePassword) {
      throw new ForbiddenException('Troca de senha obrigatória no primeiro acesso');
    }

    return true;
  }
}
