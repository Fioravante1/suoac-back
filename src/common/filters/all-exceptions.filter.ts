import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { FastifyReply } from 'fastify';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  /**
   * Campo do payload que causou o erro, quando o service souber apontá-lo — por
   * exemplo `circuit.name` no autocadastro (SUC-37), onde conflitos diferentes
   * respondem `409` e a tela precisa saber em qual campo pintar o erro.
   *
   * Opcional de propósito: o formato de erro do projeto continua sendo
   * `statusCode`/`message`/`error`, e este campo só aparece quando existe.
   */
  field?: string;
  /**
   * Todos os campos em conflito, quando houver mais de um. O autocadastro
   * reporta os conflitos de unicidade de uma vez, para o usuário corrigir tudo
   * num envio — cada envio consome uma ficha do limite por e-mail.
   *
   * `field` segue apontando o primeiro, para quem só sabe ler um.
   */
  fields?: { field: string; message: string }[];
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
    const field = res['field'];
    const fields = res['fields'];

    return {
      statusCode: status,
      body: {
        statusCode: status,
        message: (res['message'] as string | string[]) ?? exception.message,
        error: (res['error'] as string) ?? exception.name,
        // Repassados por nome, não por espalhamento do objeto: o corpo de erro é
        // contrato público, e `...res` deixaria qualquer campo que um service
        // colocasse na exceção vazar para a resposta sem ninguém decidir isso.
        ...(typeof field === 'string' && { field }),
        ...(Array.isArray(fields) && { fields: fields as { field: string; message: string }[] }),
      },
    };
  }

  /**
   * Nome do campo duplicado num `P2002`.
   *
   * **Sob Prisma 7 com `@prisma/adapter-pg` não existe `meta.target`.** O que o
   * erro traz é `meta.driverAdapterError.cause.constraint.fields`; verificado
   * contra o banco. Enquanto só `target` era lido, toda violação de unicidade
   * respondia com o literal `"Registro duplicado no campo: campo"`, porque o
   * `?? 'campo'` sempre caía — e o teste desta classe passava por usar um mock
   * com a forma que o adapter não produz.
   *
   * `meta.target` continua sendo lido depois: é a forma emitida sem driver
   * adapter, e a que volta se o adapter for trocado.
   */
  private resolveUniqueTarget(exception: Prisma.PrismaClientKnownRequestError): string {
    const meta = exception.meta as
      | { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } }
      | undefined;

    const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;

    if (Array.isArray(adapterFields) && adapterFields.length > 0) {
      return adapterFields.map((item) => String(item)).join(', ');
    }

    const target = meta?.target;

    if (Array.isArray(target) && target.length > 0) {
      return target.map((item) => String(item)).join(', ');
    }

    return typeof target === 'string' && target.length > 0 ? target : 'campo';
  }

  private handlePrismaKnownError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    body: ErrorResponseBody;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = this.resolveUniqueTarget(exception);
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
