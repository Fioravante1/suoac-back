import rateLimit from '@fastify/rate-limit';
import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

@Controller('limitado')
class LimitedController {
  @Get()
  find(): { ok: boolean } {
    return { ok: true };
  }
}

describe('Limite de requisições do @fastify/rate-limit (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({ controllers: [LimitedController] }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Mesmo registro do main.ts, com teto 1 para a segunda requisição já estourar.
    await app.register(rateLimit, { max: 1, timeWindow: '1 minute' });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 429 no formato de erro do projeto, e não 500, ao estourar o limite', async () => {
    await request(app.getHttpServer()).get('/limitado').expect(200);

    const response = await request(app.getHttpServer()).get('/limitado').expect(429);

    expect(response.body).toEqual({
      statusCode: 429,
      message: 'Muitas requisições em pouco tempo. Aguarde um instante e tente novamente.',
      error: 'Too Many Requests',
    });
    expect(response.headers['retry-after']).toBeDefined();
  });
});
