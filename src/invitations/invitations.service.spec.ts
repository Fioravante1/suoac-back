import * as crypto from 'crypto';
import { ForbiddenException, GoneException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { EmailSender } from '../common/email/email-sender';
import { HashingService } from '../common/hashing/hashing.service';
import { Prisma, type PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { INVITATION, INVITATION_ERROR_CODE } from './invitations.constants';
import { InvitationsService } from './invitations.service';

// ── Constants ────────────────────────────────────────────────────
const INVITATION_ID = 'i1i2i3i4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const OTHER_CIRCUIT_ID = 'c9c9c9c9-0000-0000-0000-000000000009';
const CONGREGATION_ID = 'g1g2g3g4-0000-0000-0000-000000000001';
const INVITER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const NEW_USER_ID = 'u5u6u7u8-0000-0000-0000-000000000002';
const TOKEN = 'a'.repeat(64);
const EMAIL = 'maria@example.com';
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$fake$hash';
const FRONTEND_URL = 'https://suoac.example.com';

// ── Helpers ──────────────────────────────────────────────────────
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildInvitation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: INVITATION_ID,
    name: 'Maria Souza',
    email: EMAIL,
    phone: '11987654321',
    role: 'CONGREGATION_COORDINATOR',
    tokenHash: hashToken(TOKEN),
    circuitId: CIRCUIT_ID,
    congregationId: CONGREGATION_ID,
    createdById: INVITER_ID,
    expiresAt: new Date(Date.now() + INVITATION.TOKEN_TTL_MS),
    usedAt: null,
    revokedAt: null,
    declinedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    circuit: { name: 'SP-17', city: 'Campinas', state: 'SP' },
    congregation: { name: 'Central', code: '31245' },
    createdBy: { name: 'João Silva' },
    ...overrides,
  };
}

function buildUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: NEW_USER_ID,
    name: 'Maria Souza',
    email: EMAIL,
    phone: '11987654321',
    role: 'CONGREGATION_COORDINATOR',
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 0,
    circuitId: CIRCUIT_ID,
    congregationId: CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: INVITER_ID,
    email: 'joao@example.com',
    role: 'CIRCUIT_COORDINATOR',
    circuitId: CIRCUIT_ID,
    congregationId: null,
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function recordNotFound(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });
}

/** Deixa o envio disparado sem `await` terminar antes da asserção. */
async function flushPendingWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Corpo de uma exceção HTTP, como o filtro global o enxerga. */
function errorBodyOf(err: unknown): Record<string, unknown> {
  return (err as { getResponse: () => Record<string, unknown> }).getResponse();
}

/** Extrai o `code` do corpo de uma exceção HTTP. */
function errorCodeOf(err: unknown): unknown {
  const body = (err as { getResponse: () => Record<string, unknown> }).getResponse();
  return body['code'];
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err: unknown) {
    return err;
  }
  throw new Error('A chamada deveria ter falhado');
}

// ── Test Suite ───────────────────────────────────────────────────
describe('InvitationsService', () => {
  let service: InvitationsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let hashingMock: jest.Mocked<Pick<HashingService, 'hash'>>;
  let emailSenderMock: jest.Mocked<Pick<EmailSender, 'send'>>;
  let authServiceMock: jest.Mocked<Pick<AuthService, 'issueSession'>>;
  let auditLogMock: jest.Mocked<Pick<AuditLogService, 'log'>>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    hashingMock = { hash: jest.fn().mockResolvedValue(PASSWORD_HASH) };
    emailSenderMock = { send: jest.fn().mockResolvedValue(undefined) };
    authServiceMock = {
      issueSession: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: {} }),
    };
    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: HashingService, useValue: hashingMock },
        { provide: EmailSender, useValue: emailSenderMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(FRONTEND_URL) } },
      ],
    }).compile();

    service = module.get(InvitationsService);

    mockUsers();
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: DeepMockProxy<PrismaClientType>) => Promise<unknown>)(prismaMock);
      }
      return Promise.resolve([]);
    });
  });

  /**
   * `user.findUnique` atende a duas buscas do serviço: por e-mail (a pessoa já tem
   * conta?) e por id (e-mail de quem criou o convite, para o aviso). Cada teste
   * decide o que cada uma devolve.
   */
  function mockUsers(options: { existing?: { id: string } | null; inviter?: { email: string } | null } = {}): void {
    const { existing = null, inviter = { email: 'joao@example.com' } } = options;

    prismaMock.user.findUnique.mockImplementation(((args: { where: { email?: string; id?: string } }) =>
      Promise.resolve(args.where.email === undefined ? inviter : existing)) as never);
  }

  // ── findByToken ────────────────────────────────────────────────
  describe('findByToken', () => {
    it('deve devolver quem convidou, o circuito e a congregação', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);

      const result = await service.findByToken(TOKEN);

      expect(result).toEqual(
        expect.objectContaining({ invitedBy: 'João Silva', circuit: 'SP-17', congregation: 'Central' }),
      );
    });

    it('deve buscar pelo hash do token, nunca pelo valor em claro', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);

      await service.findByToken(TOKEN);

      expect(prismaMock.invitation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken(TOKEN) } }),
      );
    });

    it('deve devolver o que a tela mostra: celular, código da congregação e cidade do circuito', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);

      const result = await service.findByToken(TOKEN);

      expect(result).toEqual(
        expect.objectContaining({
          phone: '11987654321',
          congregationCode: '31245',
          circuitCity: 'Campinas',
          circuitState: 'SP',
        }),
      );
    });

    it('nao deve vazar ids nem hash do token', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);

      const result = await service.findByToken(TOKEN);

      expect(Object.keys(result).sort()).toEqual(
        [
          'circuit',
          'circuitCity',
          'circuitState',
          'congregation',
          'congregationCode',
          'email',
          'expiresAt',
          'invitedBy',
          'name',
          'phone',
          'role',
        ].sort(),
      );
    });

    it('deve lançar 404 com código próprio quando o token não existe', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(null);

      const err = await captureError(service.findByToken(TOKEN));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.NOT_FOUND);
    });

    it('deve lançar 410 com código próprio quando o convite expirou', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      const err = await captureError(service.findByToken(TOKEN));

      expect(err).toBeInstanceOf(GoneException);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EXPIRED);
    });

    it('deve levar no 410 para quem foi enviado, por quem e quando valeu', async () => {
      const expiresAt = new Date(Date.now() - 1000);
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ expiresAt }) as never);

      const err = await captureError(service.findByToken(TOKEN));

      expect(errorBodyOf(err)['invitation']).toEqual({
        email: EMAIL,
        invitedBy: 'João Silva',
        sentAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt,
      });
    });

    it('nao deve levar contexto nos demais estados', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      const err = await captureError(service.findByToken(TOKEN));

      expect(errorBodyOf(err)).not.toHaveProperty('invitation');
    });

    it('deve lançar 409 com código próprio quando o convite já foi utilizado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      const err = await captureError(service.findByToken(TOKEN));

      expect((err as { getStatus: () => number }).getStatus()).toBe(409);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('deve lançar 403 com código próprio quando o convite foi revogado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ revokedAt: new Date() }) as never);

      const err = await captureError(service.findByToken(TOKEN));

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.REVOKED);
    });

    it('deve lançar 409 com código próprio quando o convite foi recusado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ declinedAt: new Date() }) as never);

      const err = await captureError(service.findByToken(TOKEN));

      expect((err as { getStatus: () => number }).getStatus()).toBe(409);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.DECLINED);
    });

    it('deve tratar convite recusado e expirado como recusado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ declinedAt: new Date(), expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      const err = await captureError(service.findByToken(TOKEN));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.DECLINED);
    });

    it('deve tratar convite revogado e recusado como revogado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ revokedAt: new Date(), declinedAt: new Date() }) as never,
      );

      const err = await captureError(service.findByToken(TOKEN));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.REVOKED);
    });

    it('deve tratar convite usado e expirado como usado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ usedAt: new Date(), expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      const err = await captureError(service.findByToken(TOKEN));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });
  });

  // ── accept ─────────────────────────────────────────────────────
  describe('accept', () => {
    const dto: AcceptInvitationDto = { name: 'Maria Souza', phone: '11987654321', password: 'Senha-Segura123' };

    beforeEach(() => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.user.create.mockResolvedValue(buildUser() as never);
    });

    it('deve criar o usuário com os dados do convite e a senha hasheada', async () => {
      await service.accept(TOKEN, dto);

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Maria Souza',
          email: EMAIL,
          phone: '11987654321',
          passwordHash: PASSWORD_HASH,
          role: 'CONGREGATION_COORDINATOR',
          circuitId: CIRCUIT_ID,
          congregationId: CONGREGATION_ID,
          mustChangePassword: false,
        },
      });
    });

    it('deve gravar o nome e o celular confirmados pelo convidado, não os do convite', async () => {
      await service.accept(TOKEN, { ...dto, name: 'Maria de Souza Lima', phone: '11912345678' });

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Maria de Souza Lima', phone: '11912345678' }),
      });
    });

    it('nao deve levar o usuário à troca de senha obrigatória', async () => {
      await service.accept(TOKEN, dto);

      const { data } = prismaMock.user.create.mock.calls[0]?.[0] ?? { data: {} };
      expect(data).toEqual(expect.objectContaining({ mustChangePassword: false }));
    });

    it('deve devolver a sessão autenticada do novo usuário', async () => {
      const result = await service.accept(TOKEN, dto);

      expect(authServiceMock.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: NEW_USER_ID }));
      expect(result.accessToken).toBe('access');
    });

    it('deve consumir o token só se o convite ainda estiver pendente e o token for o lido', async () => {
      await service.accept(TOKEN, dto);

      expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: INVITATION_ID,
          tokenHash: hashToken(TOKEN),
          usedAt: null,
          revokedAt: null,
          declinedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('deve avisar por e-mail quem enviou o convite, com o nome confirmado pelo convidado', async () => {
      mockUsers();
      prismaMock.user.create.mockResolvedValue(buildUser({ name: 'Maria de Souza Lima' }) as never);

      await service.accept(TOKEN, dto);
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledTimes(1);
      const message = emailSenderMock.send.mock.calls[0]?.[0];
      expect(message?.to).toBe('joao@example.com');
      expect(message?.text).toContain('Maria de Souza Lima');
    });

    it('deve manter o aceite e devolver a sessão quando o envio do aviso falha', async () => {
      mockUsers();
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));

      const result = await service.accept(TOKEN, dto);
      await flushPendingWork();

      expect(result.accessToken).toBe('access');
    });

    it('nao deve avisar ninguém quando o aceite falha', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUniqueOrThrow.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      await captureError(service.accept(TOKEN, dto));
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve gravar audit log da criação do usuário', async () => {
      await service.accept(TOKEN, dto);
      await flushPendingWork();

      expect(auditLogMock.log).toHaveBeenCalledWith('CREATE', 'User', NEW_USER_ID, NEW_USER_ID, expect.anything());
    });

    it('deve lançar 409 com código próprio quando o e-mail já tem conta', async () => {
      mockUsers({ existing: { id: 'existing' } });

      const err = await captureError(service.accept(TOKEN, dto));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
    });

    it('nao deve consumir o token quando o e-mail já tem conta', async () => {
      mockUsers({ existing: { id: 'existing' } });

      await captureError(service.accept(TOKEN, dto));

      expect(prismaMock.invitation.updateMany).not.toHaveBeenCalled();
    });

    it('deve lançar 409 de e-mail já cadastrado quando a conta surge entre a checagem e a criação', async () => {
      prismaMock.user.create.mockRejectedValue(uniqueViolation());

      const err = await captureError(service.accept(TOKEN, dto));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
    });

    it('nao deve criar usuário nem pedir senha hasheada quando o convite expirou', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      await captureError(service.accept(TOKEN, dto));

      expect(prismaMock.user.create).not.toHaveBeenCalled();
      expect(hashingMock.hash).not.toHaveBeenCalled();
    });

    it('deve responder com o estado verdadeiro quando perde a corrida pelo token', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUniqueOrThrow.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      const err = await captureError(service.accept(TOKEN, dto));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('nao deve criar usuário quando perde a corrida pelo token', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUniqueOrThrow.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      await captureError(service.accept(TOKEN, dto));

      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });
  });

  // ── decline ────────────────────────────────────────────────────
  describe('decline', () => {
    const dto = { reason: 'NOT_THE_PERSON' } as const;

    beforeEach(() => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockUsers();
    });

    it('deve gravar a data e o motivo só se o convite ainda estiver pendente e o token for o lido', async () => {
      await service.decline(TOKEN, dto);

      expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: INVITATION_ID,
          tokenHash: hashToken(TOKEN),
          usedAt: null,
          revokedAt: null,
          declinedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { declinedAt: expect.any(Date), declineReason: 'NOT_THE_PERSON' },
      });
    });

    it('deve avisar por e-mail quem enviou o convite, com o motivo', async () => {
      await service.decline(TOKEN, { reason: 'RECEIVED_BY_MISTAKE' });
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledTimes(1);
      const message = emailSenderMock.send.mock.calls[0]?.[0];
      expect(message?.to).toBe('joao@example.com');
      expect(message?.text).toContain('Recebi por engano');
    });

    it('deve buscar o e-mail de quem criou o convite', async () => {
      await service.decline(TOKEN, dto);
      await flushPendingWork();

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: INVITER_ID }, select: { email: true } });
    });

    it('deve manter a recusa e não enviar nada quando quem criou o convite não existe mais', async () => {
      mockUsers({ inviter: null });

      await expect(service.decline(TOKEN, dto)).resolves.toBeUndefined();
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve manter a recusa quando o envio do aviso falha', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));

      await expect(service.decline(TOKEN, dto)).resolves.toBeUndefined();
      await flushPendingWork();
    });

    it.each([
      ['usado', { usedAt: new Date() }, INVITATION_ERROR_CODE.USED],
      ['revogado', { revokedAt: new Date() }, INVITATION_ERROR_CODE.REVOKED],
      ['já recusado', { declinedAt: new Date() }, INVITATION_ERROR_CODE.DECLINED],
      ['expirado', { expiresAt: new Date(Date.now() - 1000) }, INVITATION_ERROR_CODE.EXPIRED],
    ])('deve responder com o código do estado e não gravar nada quando o convite está %s', async (_s, state, code) => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation(state) as never);

      const err = await captureError(service.decline(TOKEN, dto));

      expect(errorCodeOf(err)).toBe(code);
      expect(prismaMock.invitation.updateMany).not.toHaveBeenCalled();
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lançar 404 com código próprio quando o token não existe', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(null);

      const err = await captureError(service.decline(TOKEN, dto));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.NOT_FOUND);
    });

    it('deve responder com o estado verdadeiro quando um aceite concorrente vence a corrida', async () => {
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(buildInvitation() as never)
        .mockResolvedValueOnce(buildInvitation({ usedAt: new Date() }) as never);
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });

      const err = await captureError(service.decline(TOKEN, dto));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('nao deve avisar ninguém quando perde a corrida', async () => {
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(buildInvitation() as never)
        .mockResolvedValueOnce(buildInvitation({ usedAt: new Date() }) as never);
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });

      await captureError(service.decline(TOKEN, dto));
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lançar 409 genérico quando perde a corrida e o convite segue pendente', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });

      const err = await captureError(service.decline(TOKEN, dto));

      expect((err as { getStatus: () => number }).getStatus()).toBe(409);
    });
  });

  // ── requestRenewal ─────────────────────────────────────────────
  describe('requestRenewal', () => {
    const expired = (overrides: Record<string, unknown> = {}): never =>
      buildInvitation({ expiresAt: new Date(Date.now() - 1000), ...overrides }) as never;

    beforeEach(() => {
      prismaMock.invitation.findUnique.mockResolvedValue(expired());
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockUsers();
    });

    it('deve gravar o pedido só se o convite segue expirado, com o token lido e fora da janela', async () => {
      await service.requestRenewal(TOKEN);

      expect(prismaMock.invitation.updateMany).toHaveBeenCalledWith({
        where: {
          id: INVITATION_ID,
          tokenHash: hashToken(TOKEN),
          usedAt: null,
          revokedAt: null,
          declinedAt: null,
          expiresAt: { lte: expect.any(Date) },
          OR: [{ renewalRequestedAt: null }, { renewalRequestedAt: { lte: expect.any(Date) } }],
        },
        data: { renewalRequestedAt: expect.any(Date) },
      });
    });

    it('deve usar a janela de 24 horas', async () => {
      const before = Date.now();

      await service.requestRenewal(TOKEN);

      const after = Date.now();
      const call = prismaMock.invitation.updateMany.mock.calls[0]?.[0];
      const threshold = (
        call?.where?.OR?.[1] as { renewalRequestedAt: { lte: Date } }
      ).renewalRequestedAt.lte.getTime();
      // O limite é calculado durante a chamada, entre `before` e `after`: compara contra os dois, não só contra o primeiro.
      expect(threshold).toBeGreaterThanOrEqual(before - INVITATION.RENEWAL_REQUEST_WINDOW_MS);
      expect(threshold).toBeLessThanOrEqual(after - INVITATION.RENEWAL_REQUEST_WINDOW_MS);
      expect(INVITATION.RENEWAL_REQUEST_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('deve avisar por e-mail quem enviou o convite, sem link', async () => {
      await service.requestRenewal(TOKEN);
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledTimes(1);
      const message = emailSenderMock.send.mock.calls[0]?.[0];
      expect(message?.to).toBe('joao@example.com');
      expect(message?.text).toContain('Maria Souza');
      expect(message?.text).not.toContain('http');
    });

    it('nao deve gerar token novo nem reabrir o convite', async () => {
      await service.requestRenewal(TOKEN);

      expect(prismaMock.invitation.update).not.toHaveBeenCalled();
      const call = prismaMock.invitation.updateMany.mock.calls[0]?.[0];
      expect(call?.data).toEqual({ renewalRequestedAt: expect.any(Date) });
    });

    it('deve responder igual e não enviar outro e-mail quando o aviso já foi dado na janela', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired({ renewalRequestedAt: new Date() }));

      await expect(service.requestRenewal(TOKEN)).resolves.toBeUndefined();
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve responder 204 mesmo quando o envio do aviso falha', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));

      await expect(service.requestRenewal(TOKEN)).resolves.toBeUndefined();
      await flushPendingWork();
    });

    it('deve desfazer só o pedido gravado quando o envio do aviso falha, para a próxima tentativa avisar', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));

      await service.requestRenewal(TOKEN);
      await flushPendingWork();

      const claim = prismaMock.invitation.updateMany.mock.calls[0]?.[0];
      const claimedAt = (claim?.data as { renewalRequestedAt: Date }).renewalRequestedAt;
      expect(prismaMock.invitation.updateMany).toHaveBeenLastCalledWith({
        where: { id: INVITATION_ID, renewalRequestedAt: claimedAt },
        data: { renewalRequestedAt: null },
      });
    });

    it('deve desfazer o pedido quando quem criou o convite não existe mais', async () => {
      mockUsers({ inviter: null });

      await service.requestRenewal(TOKEN);
      await flushPendingWork();

      expect(prismaMock.invitation.updateMany).toHaveBeenCalledTimes(2);
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('nao deve desfazer o pedido quando o aviso sai', async () => {
      await service.requestRenewal(TOKEN);
      await flushPendingWork();

      expect(prismaMock.invitation.updateMany).toHaveBeenCalledTimes(1);
    });

    it('deve manter a resposta quando desfazer o pedido também falha', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));
      prismaMock.invitation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error('banco fora'));

      await expect(service.requestRenewal(TOKEN)).resolves.toBeUndefined();
      await flushPendingWork();
    });

    it('deve lançar 409 de e-mail já cadastrado quando o convidado criou conta depois do convite', async () => {
      mockUsers({ existing: { id: 'u9' } });

      const err = await captureError(service.requestRenewal(TOKEN));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
    });

    it('nao deve gravar o pedido nem avisar quando o convidado já tem conta', async () => {
      mockUsers({ existing: { id: 'u9' } });

      await captureError(service.requestRenewal(TOKEN));
      await flushPendingWork();

      expect(prismaMock.invitation.updateMany).not.toHaveBeenCalled();
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lançar 409 com código próprio quando o convite ainda é válido', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);

      const err = await captureError(service.requestRenewal(TOKEN));

      expect((err as { getStatus: () => number }).getStatus()).toBe(409);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.NOT_EXPIRED);
    });

    it.each([
      ['usado', { usedAt: new Date() }, INVITATION_ERROR_CODE.USED],
      ['revogado', { revokedAt: new Date() }, INVITATION_ERROR_CODE.REVOKED],
      ['recusado', { declinedAt: new Date() }, INVITATION_ERROR_CODE.DECLINED],
    ])('deve responder com o código do estado e não gravar nada quando o convite está %s', async (_s, state, code) => {
      prismaMock.invitation.findUnique.mockResolvedValue(expired(state));

      const err = await captureError(service.requestRenewal(TOKEN));

      expect(errorCodeOf(err)).toBe(code);
      expect(prismaMock.invitation.updateMany).not.toHaveBeenCalled();
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lançar 404 com código próprio quando o token não existe', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(null);

      const err = await captureError(service.requestRenewal(TOKEN));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.NOT_FOUND);
    });

    it('deve responder com o estado verdadeiro quando um reenvio troca o token entre a leitura e o pedido', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(buildInvitation() as never);

      const err = await captureError(service.requestRenewal(TOKEN));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.NOT_EXPIRED);
    });

    it('nao deve avisar ninguém quando perde a corrida', async () => {
      prismaMock.invitation.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired({ usedAt: new Date() }));

      await captureError(service.requestRenewal(TOKEN));
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });
  });

  // ── create ─────────────────────────────────────────────────────
  describe('create', () => {
    const input = {
      name: 'Maria Souza',
      email: '  Maria@Example.com ',
      phone: '11987654321',
      role: 'CONGREGATION_COORDINATOR' as const,
      congregationId: CONGREGATION_ID,
    };

    beforeEach(() => {
      prismaMock.congregation.findUnique.mockResolvedValue({
        id: CONGREGATION_ID,
        name: 'Central',
        circuitId: CIRCUIT_ID,
      } as never);
      prismaMock.invitation.create.mockResolvedValue(buildInvitation() as never);
    });

    it('deve guardar só o hash do token e o e-mail normalizado', async () => {
      await service.create(input, buildActor());

      const call = prismaMock.invitation.create.mock.calls[0]?.[0];
      expect(call?.data).toEqual(
        expect.objectContaining({ email: EMAIL, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      );
    });

    it('deve gravar o celular só com dígitos, sem a máscara', async () => {
      await service.create({ ...input, phone: '(11) 98765-4321' }, buildActor());

      const call = prismaMock.invitation.create.mock.calls[0]?.[0];
      expect(call?.data).toEqual(expect.objectContaining({ phone: '11987654321' }));
    });

    it('deve gravar celular nulo quando não há dígitos', async () => {
      await service.create({ ...input, phone: ' - ' }, buildActor());

      const call = prismaMock.invitation.create.mock.calls[0]?.[0];
      expect(call?.data).toEqual(expect.objectContaining({ phone: null }));
    });

    it('deve devolver um link cujo token confere com o hash gravado', async () => {
      const result = await service.create(input, buildActor());

      const call = prismaMock.invitation.create.mock.calls[0]?.[0];
      const token = new URL(result.link).searchParams.get('token') ?? '';
      expect(hashToken(token)).toBe((call?.data as { tokenHash: string }).tokenHash);
    });

    it('deve apontar o link para a tela de aceite do front', async () => {
      const result = await service.create(input, buildActor());

      expect(result.link.startsWith(`${FRONTEND_URL}/accept-invitation?token=`)).toBe(true);
    });

    it('deve dar sete dias de validade', async () => {
      const before = Date.now();

      await service.create(input, buildActor());

      const call = prismaMock.invitation.create.mock.calls[0]?.[0];
      const expiresAt = (call?.data as { expiresAt: Date }).expiresAt.getTime();
      expect(expiresAt - before).toBeGreaterThanOrEqual(INVITATION.TOKEN_TTL_MS);
    });

    it('deve enviar o e-mail do convite', async () => {
      await service.create(input, buildActor());
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }));
    });

    it('nao deve falhar a criação quando o envio do e-mail falha', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora do ar'));

      const result = await service.create(input, buildActor());
      await flushPendingWork();

      expect(result.link).toContain('token=');
    });

    it('deve nomear no e-mail quem convidou', async () => {
      await service.create(input, buildActor());
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('João Silva') }),
      );
    });

    it('deve lançar 422 quando o papel não pode ser concedido por convite', async () => {
      const circuitRole = { ...input, role: 'CIRCUIT_COORDINATOR' as never };

      await expect(service.create(circuitRole, buildActor())).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar 422 ao convidar um assistente da congregação', async () => {
      const assistant = { ...input, role: 'CONGREGATION_ASSISTANT' as never };

      await expect(service.create(assistant, buildActor())).rejects.toThrow(UnprocessableEntityException);
    });

    it('nao deve gravar convite de assistente da congregação', async () => {
      const assistant = { ...input, role: 'CONGREGATION_ASSISTANT' as never };

      await captureError(service.create(assistant, buildActor()));

      expect(prismaMock.invitation.create).not.toHaveBeenCalled();
    });

    it('nao deve gravar convite de papel de circuito', async () => {
      const circuitRole = { ...input, role: 'CIRCUIT_COORDINATOR' as never };

      await captureError(service.create(circuitRole, buildActor()));

      expect(prismaMock.invitation.create).not.toHaveBeenCalled();
    });

    it('deve lançar 403 quando a congregação é de outro circuito', async () => {
      prismaMock.congregation.findUnique.mockResolvedValue({
        id: CONGREGATION_ID,
        name: 'Central',
        circuitId: OTHER_CIRCUIT_ID,
      } as never);

      await expect(service.create(input, buildActor())).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar 403 quando quem convida é de congregação', async () => {
      await expect(service.create(input, buildActor({ role: 'CONGREGATION_COORDINATOR' }))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar 404 quando a congregação não existe', async () => {
      prismaMock.congregation.findUnique.mockResolvedValue(null);

      await expect(service.create(input, buildActor())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar 409 de e-mail já cadastrado quando o convidado já tem conta', async () => {
      mockUsers({ existing: { id: 'existing' } });

      const err = await captureError(service.create(input, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
    });

    it('nao deve criar convite para quem já tem conta com o e-mail em outra caixa', async () => {
      mockUsers({ existing: { id: 'existing' } });

      const err = await captureError(service.create({ ...input, email: ' MARIA@Example.COM ' }, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'maria@example.com' },
        select: { id: true },
      });
      expect(prismaMock.invitation.create).not.toHaveBeenCalled();
    });
  });

  // ── resend ─────────────────────────────────────────────────────
  describe('resend', () => {
    beforeEach(() => {
      prismaMock.invitation.findUnique.mockResolvedValue(
        buildInvitation({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );
      prismaMock.invitation.update.mockResolvedValue(buildInvitation() as never);
    });

    it('deve gerar token novo e renovar o prazo de convite expirado', async () => {
      const result = await service.resend(INVITATION_ID, buildActor());

      const call = prismaMock.invitation.update.mock.calls[0]?.[0];
      expect(call?.data).toEqual({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
        declinedAt: null,
        declineReason: null,
        renewalRequestedAt: null,
      });
      expect(result.link).toContain('token=');
    });

    it('deve reabrir o convite recusado com token novo', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ declinedAt: new Date() }) as never);

      const result = await service.resend(INVITATION_ID, buildActor());

      const call = prismaMock.invitation.update.mock.calls[0]?.[0];
      expect(call?.data).toEqual(expect.objectContaining({ declinedAt: null, declineReason: null }));
      expect(result.link).toContain('token=');
    });

    it('deve escrever só enquanto o convite não foi usado nem revogado', async () => {
      await service.resend(INVITATION_ID, buildActor());

      expect(prismaMock.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVITATION_ID, usedAt: null, revokedAt: null } }),
      );
    });

    it('deve responder com o estado verdadeiro quando um aceite concorrente consome o convite', async () => {
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(buildInvitation({ expiresAt: new Date(Date.now() - 1000) }) as never)
        .mockResolvedValueOnce(buildInvitation({ usedAt: new Date() }) as never);
      prismaMock.invitation.update.mockRejectedValue(recordNotFound());

      const err = await captureError(service.resend(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('nao deve enviar e-mail quando um aceite concorrente consome o convite', async () => {
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(buildInvitation({ expiresAt: new Date(Date.now() - 1000) }) as never)
        .mockResolvedValueOnce(buildInvitation({ usedAt: new Date() }) as never);
      prismaMock.invitation.update.mockRejectedValue(recordNotFound());

      await captureError(service.resend(INVITATION_ID, buildActor()));
      await flushPendingWork();

      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lançar 409 de e-mail já cadastrado quando o convidado criou conta depois do convite', async () => {
      mockUsers({ existing: { id: 'existing' } });

      const err = await captureError(service.resend(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.EMAIL_ALREADY_REGISTERED);
    });

    it('nao deve trocar o token quando o convidado já tem conta', async () => {
      mockUsers({ existing: { id: 'existing' } });

      await captureError(service.resend(INVITATION_ID, buildActor()));

      expect(prismaMock.invitation.update).not.toHaveBeenCalled();
    });

    it('deve nomear no e-mail quem criou o convite, o mesmo que a tela de aceite mostra', async () => {
      await service.resend(INVITATION_ID, buildActor({ sub: 'outro-coordenador' }));
      await flushPendingWork();

      expect(emailSenderMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('João Silva') }),
      );
    });

    it('deve lançar 409 quando o convite já foi utilizado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      const err = await captureError(service.resend(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('deve lançar 403 quando o convite foi revogado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ revokedAt: new Date() }) as never);

      const err = await captureError(service.resend(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.REVOKED);
    });

    it('deve lançar 403 quando o convite é de outro circuito', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ circuitId: OTHER_CIRCUIT_ID }) as never);

      await expect(service.resend(INVITATION_ID, buildActor())).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar 404 quando o convite não existe', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(null);

      await expect(service.resend(INVITATION_ID, buildActor())).rejects.toThrow(NotFoundException);
    });
  });

  // ── revoke ─────────────────────────────────────────────────────
  describe('revoke', () => {
    it('deve marcar o convite pendente como revogado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);
      prismaMock.invitation.update.mockResolvedValue(buildInvitation({ revokedAt: new Date() }) as never);

      const result = await service.revoke(INVITATION_ID, buildActor());

      expect(result.state).toBe('REVOKED');
    });

    it('deve lançar 409 quando o convite já foi utilizado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ usedAt: new Date() }) as never);

      const err = await captureError(service.revoke(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('deve revogar só enquanto o convite não foi usado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation() as never);
      prismaMock.invitation.update.mockResolvedValue(buildInvitation({ revokedAt: new Date() }) as never);

      await service.revoke(INVITATION_ID, buildActor());

      expect(prismaMock.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVITATION_ID, usedAt: null, revokedAt: null } }),
      );
    });

    it('deve lançar 409 quando um aceite concorrente consome o convite antes da revogação', async () => {
      prismaMock.invitation.findUnique
        .mockResolvedValueOnce(buildInvitation() as never)
        .mockResolvedValueOnce(buildInvitation({ usedAt: new Date() }) as never);
      prismaMock.invitation.update.mockRejectedValue(recordNotFound());

      const err = await captureError(service.revoke(INVITATION_ID, buildActor()));

      expect(errorCodeOf(err)).toBe(INVITATION_ERROR_CODE.USED);
    });

    it('nao deve gravar nada ao revogar um convite recusado, que segue reenviável', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ declinedAt: new Date() }) as never);

      const result = await service.revoke(INVITATION_ID, buildActor());

      expect(prismaMock.invitation.update).not.toHaveBeenCalled();
      expect(result.state).toBe('DECLINED');
    });

    it('nao deve gravar nada ao revogar um convite já revogado', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ revokedAt: new Date() }) as never);

      await service.revoke(INVITATION_ID, buildActor());

      expect(prismaMock.invitation.update).not.toHaveBeenCalled();
    });

    it('deve lançar 403 quando o convite é de outro circuito', async () => {
      prismaMock.invitation.findUnique.mockResolvedValue(buildInvitation({ circuitId: OTHER_CIRCUIT_ID }) as never);

      await expect(service.revoke(INVITATION_ID, buildActor())).rejects.toThrow(ForbiddenException);
    });
  });
});
