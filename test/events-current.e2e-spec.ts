import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import request from 'supertest';
import { CircuitOwnershipGuard } from '../src/auth/guards/circuit-ownership.guard';
import type { JwtPayload } from '../src/auth/interfaces/jwt-payload.interface';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { EventsController } from '../src/events/events.controller';
import { EventsService } from '../src/events/events.service';

const CIRCUIT_ID = '6f1c2a4e-8b3d-4c5e-9f60-1a2b3c4d5e6f';
const OTHER_CIRCUIT_ID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';

const USER: JwtPayload = {
  sub: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d',
  email: 'coordenador@example.com',
  role: 'CIRCUIT_COORDINATOR',
  circuitId: CIRCUIT_ID,
  congregationId: null,
};

describe('Contrato HTTP do evento atual do circuito (e2e)', () => {
  let app: NestFastifyApplication;
  let findCurrent: jest.Mock;

  beforeEach(async () => {
    findCurrent = jest.fn();

    const moduleFixture = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: { findCurrent } },
        { provide: APP_GUARD, useClass: CircuitOwnershipGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Faz o papel do JwtAuthGuard: o guard de circuito compara o `:circuitId` com o usuário do token.
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (req: FastifyRequest & { user?: JwtPayload }) => {
        req.user = USER;
      });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 com o evento atual e os dias', async () => {
    findCurrent.mockResolvedValue({ id: 'evento-1', status: 'OPEN', days: [{ dayNumber: 1 }] });

    const response = await request(app.getHttpServer()).get(`/circuits/${CIRCUIT_ID}/events/current`).expect(200);

    expect(response.body).toEqual({ id: 'evento-1', status: 'OPEN', days: [{ dayNumber: 1 }] });
  });

  it('responde 204 sem corpo quando o circuito não tem evento atual', async () => {
    findCurrent.mockResolvedValue(null);

    const response = await request(app.getHttpServer()).get(`/circuits/${CIRCUIT_ID}/events/current`).expect(204);

    expect(response.text).toBe('');
  });

  it('responde 403 sem consultar o service quando o circuito é de outro usuário', async () => {
    await request(app.getHttpServer()).get(`/circuits/${OTHER_CIRCUIT_ID}/events/current`).expect(403);

    expect(findCurrent).not.toHaveBeenCalled();
  });

  it('responde 404 quando o circuito não existe', async () => {
    findCurrent.mockRejectedValue(new NotFoundException('Circuito não encontrado'));

    await request(app.getHttpServer()).get(`/circuits/${CIRCUIT_ID}/events/current`).expect(404);
  });
});
