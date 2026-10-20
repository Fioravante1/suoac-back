import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { CircuitSignupService } from '../src/auth/circuit-signup.service';
import type { CreateCircuitSignupDto } from '../src/auth/dto/create-circuit-signup.dto';
import { PasswordResetService } from '../src/auth/password-reset.service';

function buildPayload(circuit: Record<string, unknown>): Record<string, unknown> {
  return {
    coordinator: {
      name: 'João Silva',
      email: 'JOAO@EXAMPLE.COM',
      phone: '(11) 98765-4321',
      password: 'Senha123',
    },
    circuit,
    congregations: [{ code: 'sp17-central', name: 'Central' }],
  };
}

describe('Contrato HTTP do autocadastro de circuito (e2e)', () => {
  let app: NestFastifyApplication;
  let requestSignup: jest.Mock<Promise<void>, [CreateCircuitSignupDto]>;

  beforeEach(async () => {
    requestSignup = jest.fn().mockResolvedValue(undefined);

    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: PasswordResetService, useValue: {} },
        { provide: CircuitSignupService, useValue: { requestSignup } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('aceita o contrato atual e normaliza o identificador no campo name', async () => {
    await request(app.getHttpServer())
      .post('/auth/circuit-signups')
      .send(buildPayload({ name: ' sp-019 a ', city: ' Campinas ', state: 'sp' }))
      .expect(202);

    expect(requestSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        circuit: expect.objectContaining({ name: 'SP-019 A', city: 'Campinas', state: 'SP' }),
      }),
    );
  });

  it('aceita temporariamente o payload legado e deixa code prevalecer', async () => {
    await request(app.getHttpServer())
      .post('/auth/circuit-signups')
      .send(
        buildPayload({
          code: ' sp-17 ',
          name: 'Circuito Metropolitano de São Paulo Dezessete',
          city: 'São Paulo',
          state: 'SP',
        }),
      )
      .expect(202);

    expect(requestSignup).toHaveBeenCalledWith(
      expect.objectContaining({ circuit: expect.objectContaining({ code: 'SP-17' }) }),
    );
  });

  it('recusa um identificador atual acima de 20 caracteres', async () => {
    await request(app.getHttpServer())
      .post('/auth/circuit-signups')
      .send(buildPayload({ name: 'CIRCUITO-COM-MAIS-DE-20', city: 'Campinas', state: 'SP' }))
      .expect(400);

    expect(requestSignup).not.toHaveBeenCalled();
  });
});
