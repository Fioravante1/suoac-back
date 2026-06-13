import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { FastifyReply } from 'fastify';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const { statusCode, body } = this.resolveException(exception);

    if (statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception, 'Erro interno do servidor');
    }

    void reply.status(statusCode).send(body);
  }

  private resolveException(exception: unknown): { statusCode: number; body: ErrorResponseBody } {
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaKnownError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: 400,
        body: { statusCode: 400, message: 'Dados inválidos na requisição', error: 'Bad Request' },
      };
    }

    return {
      statusCode: 500,
      body: { statusCode: 500, message: 'Erro interno do servidor', error: 'Internal Server Error' },
    };
  }

  private handleHttpException(exception: HttpException): { statusCode: number; body: ErrorResponseBody } {
    const status = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        statusCode: status,
        body: { statusCode: status, message: response, error: exception.name },
      };
    }

    const res = response as Record<string, unknown>;
    return {
      statusCode: status,
      body: {
        statusCode: status,
        message: (res['message'] as string | string[]) ?? exception.message,
        error: (res['error'] as string) ?? exception.name,
      },
    };
  }

  private handlePrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    body: ErrorResponseBody;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'campo';
        this.logger.warn(`Registro duplicado: ${target}`);
        return {
          statusCode: 409,
          body: { statusCode: 409, message: `Registro duplicado no campo: ${target}`, error: 'Conflict' },
        };
      }
      case 'P2003': {
        this.logger.warn('Referência a registro inexistente');
        return {
          statusCode: 409,
          body: { statusCode: 409, message: 'Referência a registro inexistente', error: 'Conflict' },
        };
      }
      case 'P2025': {
        this.logger.warn('Registro não encontrado');
        return {
          statusCode: 404,
          body: { statusCode: 404, message: 'Registro não encontrado', error: 'Not Found' },
        };
      }
      default:
        return {
          statusCode: 500,
          body: { statusCode: 500, message: 'Erro interno do servidor', error: 'Internal Server Error' },
        };
    }
  }
}
