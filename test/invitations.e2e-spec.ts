import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import {
  invitationDeclined,
  invitationEmailAlreadyRegistered,
  invitationExpired,
  invitationNotExpired,
  invitationNotFound,
  invitationRevoked,
  invitationUsed,
} from '../src/invitations/invitation-errors';
import { InvitationsController } from '../src/invitations/invitations.controller';
import { InvitationsService } from '../src/invitations/invitations.service';

const TOKEN = 'a'.repeat(64);
const VALID_BODY = { name: 'Maria Souza', phone: '11987654321', password: 'Senha123' };
const EXPIRED_DETAILS = {
  email: 'maria@example.com',
  invitedBy: 'João Silva',
  sentAt: new Date('2026-10-14T12:00:00Z'),
  expiresAt: new Date('2026-10-21T12:00:00Z'),
};

describe('Contrato HTTP do convite de congregação (e2e)', () => {
  let app: NestFastifyApplication;
  let findByToken: jest.Mock;
  let accept: jest.Mock;
  let decline: jest.Mock;
  let requestRenewal: jest.Mock;

  beforeEach(async () => {
    findByToken = jest.fn();
    accept = jest.fn();
    decline = jest.fn();
    requestRenewal = jest.fn();

    const moduleFixture = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: { findByToken, accept, decline, requestRenewal } }],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /invitations/:token', () => {
    it('responde 200 com o contexto do convite', async () => {
      findByToken.mockResolvedValue({ name: 'Maria Souza', congregation: 'Central' });

      const response = await request(app.getHttpServer()).get(`/invitations/${TOKEN}`).expect(200);

      expect(response.body).toEqual({ name: 'Maria Souza', congregation: 'Central' });
    });

    it.each([
      ['inexistente', invitationNotFound(), 404, 'INVITATION_NOT_FOUND'],
      ['expirado', invitationExpired(EXPIRED_DETAILS), 410, 'INVITATION_EXPIRED'],
      ['já utilizado', invitationUsed(), 409, 'INVITATION_USED'],
      ['revogado', invitationRevoked(), 403, 'INVITATION_REVOKED'],
      ['recusado', invitationDeclined(), 409, 'INVITATION_DECLINED'],
    ])('distingue o convite %s por status e code', async (_state, exception, status, code) => {
      findByToken.mockRejectedValue(exception);

      const response = await request(app.getHttpServer()).get(`/invitations/${TOKEN}`).expect(status);

      expect(response.body).toEqual(expect.objectContaining({ statusCode: status, code }));
    });
  });

  describe('GET /invitations/:token — convite expirado', () => {
    it('leva no corpo do 410 para quem foi enviado, por quem e quando valeu', async () => {
      findByToken.mockRejectedValue(invitationExpired(EXPIRED_DETAILS));

      const response = await request(app.getHttpServer()).get(`/invitations/${TOKEN}`).expect(410);

      expect(response.body).toEqual(
        expect.objectContaining({
          code: 'INVITATION_EXPIRED',
          invitation: {
            email: 'maria@example.com',
            invitedBy: 'João Silva',
            sentAt: '2026-10-14T12:00:00.000Z',
            expiresAt: '2026-10-21T12:00:00.000Z',
          },
        }),
      );
    });

    it('não leva contexto nos demais estados', async () => {
      findByToken.mockRejectedValue(invitationUsed());

      const response = await request(app.getHttpServer()).get(`/invitations/${TOKEN}`).expect(409);

      expect(response.body).not.toHaveProperty('invitation');
    });
  });

  describe('POST /invitations/:token/acceptances', () => {
    it('responde 201 com a sessão autenticada', async () => {
      accept.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1' } });

      const response = await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/acceptances`)
        .send(VALID_BODY)
        .expect(201);

      expect(response.body).toEqual(expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' }));
    });

    it('repassa o token da rota e a senha ao service', async () => {
      accept.mockResolvedValue({});

      await request(app.getHttpServer()).post(`/invitations/${TOKEN}/acceptances`).send(VALID_BODY);

      expect(accept).toHaveBeenCalledWith(TOKEN, VALID_BODY);
    });

    it('normaliza o celular e o nome antes de chegar ao service', async () => {
      accept.mockResolvedValue({});

      await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/acceptances`)
        .send({ ...VALID_BODY, name: '  Maria   Souza ', phone: '(11) 98765-4321' })
        .expect(201);

      expect(accept).toHaveBeenCalledWith(TOKEN, VALID_BODY);
    });

    it.each([
      ['sem nome', { phone: VALID_BODY.phone, password: VALID_BODY.password }],
      ['sem celular', { name: VALID_BODY.name, password: VALID_BODY.password }],
      ['só com a senha', { password: VALID_BODY.password }],
      ['com nome sem sobrenome', { ...VALID_BODY, name: 'Maria' }],
      ['com celular incompleto', { ...VALID_BODY, phone: '(11) 9876' }],
    ])('recusa o aceite %s sem chamar o service', async (_case, body) => {
      await request(app.getHttpServer()).post(`/invitations/${TOKEN}/acceptances`).send(body).expect(400);

      expect(accept).not.toHaveBeenCalled();
    });

    it('responde 409 com code próprio quando o e-mail já tem conta', async () => {
      accept.mockRejectedValue(invitationEmailAlreadyRegistered());

      const response = await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/acceptances`)
        .send(VALID_BODY)
        .expect(409);

      expect(response.body).toEqual(expect.objectContaining({ code: 'INVITATION_EMAIL_ALREADY_REGISTERED' }));
    });

    it('recusa senha fraca sem chamar o service', async () => {
      await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/acceptances`)
        .send({ ...VALID_BODY, password: 'fraca' })
        .expect(400);

      expect(accept).not.toHaveBeenCalled();
    });

    it('recusa campos fora do contrato, como nome, e-mail ou papel', async () => {
      // O convite define e-mail, papel e congregação; o aceite não pode sobrescrevê-los.
      await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/acceptances`)
        .send({ ...VALID_BODY, role: 'CIRCUIT_COORDINATOR', email: 'outro@example.com' })
        .expect(400);

      expect(accept).not.toHaveBeenCalled();
    });
  });

  describe('POST /invitations/:token/declines', () => {
    it('responde 204 sem corpo', async () => {
      decline.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/declines`)
        .send({ reason: 'NOT_THE_PERSON' })
        .expect(204);

      expect(response.body).toEqual({});
    });

    it.each(['NOT_THE_PERSON', 'CANNOT_ASSUME_NOW', 'RECEIVED_BY_MISTAKE'])('aceita o motivo %s', async (reason) => {
      decline.mockResolvedValue(undefined);

      await request(app.getHttpServer()).post(`/invitations/${TOKEN}/declines`).send({ reason }).expect(204);

      expect(decline).toHaveBeenCalledWith(TOKEN, { reason });
    });

    it.each([
      ['sem motivo', {}],
      ['com motivo fora da lista', { reason: 'OUTRO' }],
      ['com texto livre além do motivo', { reason: 'NOT_THE_PERSON', comment: 'x' }],
    ])('recusa o pedido %s sem chamar o service', async (_case, body) => {
      await request(app.getHttpServer()).post(`/invitations/${TOKEN}/declines`).send(body).expect(400);

      expect(decline).not.toHaveBeenCalled();
    });

    it.each([
      ['inexistente', invitationNotFound(), 404, 'INVITATION_NOT_FOUND'],
      ['expirado', invitationExpired(EXPIRED_DETAILS), 410, 'INVITATION_EXPIRED'],
      ['já utilizado', invitationUsed(), 409, 'INVITATION_USED'],
      ['revogado', invitationRevoked(), 403, 'INVITATION_REVOKED'],
      ['já recusado', invitationDeclined(), 409, 'INVITATION_DECLINED'],
    ])('distingue o convite %s por status e code', async (_state, exception, status, code) => {
      decline.mockRejectedValue(exception);

      const response = await request(app.getHttpServer())
        .post(`/invitations/${TOKEN}/declines`)
        .send({ reason: 'NOT_THE_PERSON' })
        .expect(status);

      expect(response.body).toEqual(expect.objectContaining({ statusCode: status, code }));
    });
  });

  describe('POST /invitations/:token/renewal-requests', () => {
    it('responde 204 sem corpo e sem exigir corpo na requisição', async () => {
      requestRenewal.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer()).post(`/invitations/${TOKEN}/renewal-requests`).expect(204);

      expect(response.body).toEqual({});
      expect(requestRenewal).toHaveBeenCalledWith(TOKEN);
    });

    it.each([
      ['inexistente', invitationNotFound(), 404, 'INVITATION_NOT_FOUND'],
      ['ainda válido', invitationNotExpired(), 409, 'INVITATION_NOT_EXPIRED'],
      ['já utilizado', invitationUsed(), 409, 'INVITATION_USED'],
      ['revogado', invitationRevoked(), 403, 'INVITATION_REVOKED'],
      ['recusado', invitationDeclined(), 409, 'INVITATION_DECLINED'],
      ['de e-mail já cadastrado', invitationEmailAlreadyRegistered(), 409, 'INVITATION_EMAIL_ALREADY_REGISTERED'],
    ])('distingue o convite %s por status e code', async (_state, exception, status, code) => {
      requestRenewal.mockRejectedValue(exception);

      const response = await request(app.getHttpServer()).post(`/invitations/${TOKEN}/renewal-requests`).expect(status);

      expect(response.body).toEqual(expect.objectContaining({ statusCode: status, code }));
    });
  });
});
