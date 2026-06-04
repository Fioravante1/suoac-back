import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

// ── Helpers ──────────────────────────────────────────────────────
interface MockReply {
  status: jest.Mock;
  send: jest.Mock;
}

function buildHostMock(): { host: { switchToHttp: () => { getResponse: () => MockReply } }; reply: MockReply } {
  const reply: MockReply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
    }),
  };

  return { host, reply };
}

function catchException(filter: AllExceptionsFilter, exception: unknown): { reply: MockReply } {
  const { host, reply } = buildHostMock();
  filter.catch(exception, host as never);
  return { reply };
}

function expectResponse(reply: MockReply, statusCode: number, body: Record<string, unknown>): void {
  expect(reply.status).toHaveBeenCalledWith(statusCode);
  expect(reply.send).toHaveBeenCalledWith(expect.objectContaining(body));
}

// ── Test Suite ───────────────────────────────────────────────────
describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  // ── HttpException ──────────────────────────────────────────────
  describe('HttpException', () => {
    it('deve preservar NotFoundException (404)', () => {
      const exception = new NotFoundException('Evento não encontrado');
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 404, { statusCode: 404, message: 'Evento não encontrado', error: 'Not Found' });
    });

    it('deve preservar ConflictException (409)', () => {
      const exception = new ConflictException('Email já existe');
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 409, { statusCode: 409, message: 'Email já existe', error: 'Conflict' });
    });

    it('deve preservar BadRequestException com array de mensagens do ValidationPipe', () => {
      const messages = ['name must be a string', 'city should not be empty'];
      const exception = new BadRequestException({ statusCode: 400, message: messages, error: 'Bad Request' });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 400, { statusCode: 400, message: messages, error: 'Bad Request' });
    });

    it('deve preservar UnprocessableEntityException (422)', () => {
      const exception = new UnprocessableEntityException('Evento já finalizado');
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 422, { statusCode: 422, message: 'Evento já finalizado' });
    });

    it('deve tratar HttpException com response string', () => {
      const exception = new HttpException('I am a teapot', 418);
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 418, { statusCode: 418, message: 'I am a teapot' });
    });
  });

  // ── Prisma.PrismaClientKnownRequestError ──────────────────────────────
  describe('Prisma.PrismaClientKnownRequestError', () => {
    it('deve mapear P2002 para 409 Conflict com campo duplicado', () => {
      const exception = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.0.0',
        meta: { target: ['email'] },
      });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 409, {
        statusCode: 409,
        message: 'Registro duplicado no campo: email',
        error: 'Conflict',
      });
    });

    it('deve mapear P2003 para 409 Conflict', () => {
      const exception = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '7.0.0',
      });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 409, {
        statusCode: 409,
        message: 'Referência a registro inexistente',
        error: 'Conflict',
      });
    });

    it('deve mapear P2025 para 404 Not Found', () => {
      const exception = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.0.0',
      });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 404, {
        statusCode: 404,
        message: 'Registro não encontrado',
        error: 'Not Found',
      });
    });

    it('deve mapear código Prisma desconhecido para 500', () => {
      const exception = new Prisma.PrismaClientKnownRequestError('Unknown error', {
        code: 'P9999',
        clientVersion: '7.0.0',
      });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 500, {
        statusCode: 500,
        message: 'Erro interno do servidor',
        error: 'Internal Server Error',
      });
    });
  });

  // ── Prisma.PrismaClientValidationError ────────────────────────────────
  describe('Prisma.PrismaClientValidationError', () => {
    it('deve mapear para 400 Bad Request', () => {
      const exception = new Prisma.PrismaClientValidationError('Invalid argument', { clientVersion: '7.0.0' });
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 400, {
        statusCode: 400,
        message: 'Dados inválidos na requisição',
        error: 'Bad Request',
      });
    });
  });

  // ── Erro desconhecido ──────────────────────────────────────────
  describe('Erro desconhecido', () => {
    it('deve retornar 500 sem expor stacktrace', () => {
      const exception = new Error('algo inesperado aconteceu');
      const { reply } = catchException(filter, exception);
      expectResponse(reply, 500, {
        statusCode: 500,
        message: 'Erro interno do servidor',
        error: 'Internal Server Error',
      });
    });

    it('deve chamar logger.error para erros 500', () => {
      const loggerSpy = jest.spyOn(filter['logger'], 'error').mockImplementation();
      const exception = new Error('internal failure');
      catchException(filter, exception);
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it('deve tratar exceção não-Error (string, number, etc.)', () => {
      const { reply } = catchException(filter, 'string error');
      expectResponse(reply, 500, {
        statusCode: 500,
        message: 'Erro interno do servidor',
        error: 'Internal Server Error',
      });
    });
  });

  // ── Formato de resposta ────────────────────────────────────────
  describe('Formato de resposta', () => {
    it('deve sempre retornar objeto com statusCode, message e error', () => {
      const exception = new NotFoundException('Recurso não encontrado');
      const { reply } = catchException(filter, exception);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: expect.any(Number) as number,
          message: expect.anything() as string,
          error: expect.any(String) as string,
        }),
      );
    });
  });
});
