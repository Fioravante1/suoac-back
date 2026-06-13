import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class CircuitOwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: JwtPayload }>();
    const params = request.params as Record<string, string> | undefined;
    const circuitId = params?.['circuitId'];

    if (!circuitId) {
      return true;
    }

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acesso negado');
    }

    if (user.circuitId !== circuitId) {
      throw new ForbiddenException('Sem permissão para acessar recursos de outro circuito');
    }

    return true;
  }
}
