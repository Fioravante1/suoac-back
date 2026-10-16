import { BadRequestException, ConflictException, GoneException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailSender } from '../common/email/email-sender';
import { HashingService } from '../common/hashing/hashing.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

// ── Types ────────────────────────────────────────────────────────
interface PrismaRequestRow {
  id: string;
  email: string;
  tokenHash: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  userId: string | null;
  createdAt: Date;
}

// ── Constants ────────────────────────────────────────────────────
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const REQUEST_ID = 'r1r2r3r4-0000-0000-0000-000000000001';
const EMAIL = 'joao@example.com';
const TOKEN = 'a'.repeat(64);
const FRONTEND_URL = 'https://suoac.example.com';

// ── Helpers ──────────────────────────────────────────────────────
function buildUser(overrides: Partial<{ isActive: boolean; email: string; name: string }> = {}): {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
} {
  return {
    id: USER_ID,
    name: overrides.name ?? 'João Silva',
    email: overrides.email ?? EMAIL,
    isActive: overrides.isActive ?? true,
  };
}

/**
 * `null` é valor significativo em quase todo campo desta linha — token sem
 * usuário, sem expiração, sem uso —, então os defaults só entram quando a chave
 * está ausente, e não quando vem nula.
 */
function buildRequestRow(overrides: Partial<PrismaRequestRow> = {}): PrismaRequestRow {
  return {
    id: REQUEST_ID,
    email: EMAIL,
    tokenHash: 'hash-do-token',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    userId: USER_ID,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Deixa o envio disparado sem `await` terminar antes da asserção. */
async function flushPendingWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

// ── Test Suite ───────────────────────────────────────────────────
describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let hashingMock: jest.Mocked<Pick<HashingService, 'hash'>>;
  let emailSenderMock: jest.Mocked<Pick<EmailSender, 'send'>>;
  let auditLogMock: jest.Mocked<Pick<AuditLogService, 'log'>>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    hashingMock = { hash: jest.fn().mockResolvedValue('novo-hash') };
    emailSenderMock = { send: jest.fn().mockResolvedValue(undefined) };
    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };

    const configMock = {
      get: jest.fn((key: string) => (key === 'FRONTEND_URL' ? FRONTEND_URL : undefined)),
    };

    const module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: HashingService, useValue: hashingMock },
        { provide: EmailSender, useValue: emailSenderMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(PasswordResetService);
    prismaMock.passwordResetRequest.count.mockResolvedValue(0);

    // `requestReset` roda numa transação interativa; sem isto o callback — que é
    // onde está toda a lógica — nunca seria executado pelo mock.
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: DeepMockProxy<PrismaClientType>) => Promise<unknown>)(prismaMock);
      }
      return Promise.resolve([]);
    });
  });

  // ── requestReset ───────────────────────────────────────────────
  describe('requestReset', () => {
    it('deve gerar o token e enviar o e-mail quando a conta existe', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      expect(prismaMock.passwordResetRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: EMAIL, userId: USER_ID, tokenHash: expect.any(String) as string }),
      });
      expect(emailSenderMock.send).toHaveBeenCalledTimes(1);
    });

    it('nao deve invalidar os links anteriores, para terceiros nao poderem matar o link da vitima', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      // Quem soubesse o e-mail da vítima poderia, só pedindo de novo, derrubar à
      // distância o link que ela já tinha recebido na caixa de entrada.
      expect(prismaMock.passwordResetRequest.updateMany).not.toHaveBeenCalled();
    });

    it('deve contar e inserir na mesma transacao, para o limite nao ser passavel em paralelo', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      // Sem a transação com lock por e-mail, requisições concorrentes leriam a
      // mesma contagem antiga e todas passariam pelo limite.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('deve preservar as solicitacoes anteriores, que sao o historico do limite por e-mail', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      // Apagar o histórico zeraria o contador a cada pedido novo, e o limite
      // por e-mail nunca dispararia.
      expect(prismaMock.passwordResetRequest.deleteMany).not.toHaveBeenCalled();
    });

    it('deve enviar um link apontando para a rota de redefinicao do frontend', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      const [message] = emailSenderMock.send.mock.calls[0] ?? [];
      expect(message?.text).toContain(`${FRONTEND_URL}/reset-password?token=`);
    });

    it('deve persistir apenas o hash do token, nunca o valor em claro', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      const [message] = emailSenderMock.send.mock.calls[0] ?? [];
      const sentToken = message?.text.split('token=')[1]?.split('\n')[0] ?? '';
      const createCall = prismaMock.passwordResetRequest.create.mock.calls[0]?.[0] as
        | { data: { tokenHash?: string | null } }
        | undefined;

      expect(sentToken).toHaveLength(64);
      expect(createCall?.data.tokenHash).not.toBe(sentToken);
    });

    it('deve registrar a tentativa sem token nem envio quando o e-mail nao tem conta', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      expect(prismaMock.passwordResetRequest.create).toHaveBeenCalledWith({ data: { email: EMAIL } });
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve registrar a tentativa sem envio quando a conta esta inativa', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser({ isActive: false }) as never);

      await service.requestReset({ email: EMAIL });
      await flushPendingWork();

      expect(prismaMock.passwordResetRequest.create).toHaveBeenCalledWith({ data: { email: EMAIL } });
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve normalizar o e-mail antes de contar as tentativas', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await service.requestReset({ email: '  JOAO@Example.COM ' });

      expect(prismaMock.passwordResetRequest.count).toHaveBeenCalledWith({
        where: { email: EMAIL, createdAt: { gte: expect.any(Date) as Date } },
      });
    });

    it('deve encontrar a conta ignorando a caixa do e-mail digitado', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);

      await service.requestReset({ email: 'JOAO@Example.COM' });

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: EMAIL, mode: 'insensitive' } },
      });
    });

    it('deve lancar 429 quando o limite por e-mail foi atingido', async () => {
      prismaMock.passwordResetRequest.count.mockResolvedValue(3);

      await expect(service.requestReset({ email: EMAIL })).rejects.toThrow(HttpException);
    });

    it('deve responder 429 no formato de erro do projeto', async () => {
      prismaMock.passwordResetRequest.count.mockResolvedValue(3);

      const error = await service.requestReset({ email: EMAIL }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toEqual({
        statusCode: 429,
        message: expect.any(String) as string,
        error: 'Too Many Requests',
      });
    });

    it('nao deve registrar tentativa nem buscar usuario quando o limite foi atingido', async () => {
      prismaMock.passwordResetRequest.count.mockResolvedValue(3);

      await expect(service.requestReset({ email: EMAIL })).rejects.toThrow(HttpException);

      expect(prismaMock.passwordResetRequest.create).not.toHaveBeenCalled();
      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    });

    it('deve contar tentativas de e-mail inexistente no mesmo balde, para o 429 nao delatar contas', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await service.requestReset({ email: EMAIL });

      expect(prismaMock.passwordResetRequest.create).toHaveBeenCalledWith({ data: { email: EMAIL } });
    });

    it('nao deve propagar falha de envio do provedor', async () => {
      prismaMock.user.findFirst.mockResolvedValue(buildUser() as never);
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora do ar'));

      await expect(service.requestReset({ email: EMAIL })).resolves.toBeUndefined();
      await flushPendingWork();
    });
  });

  // ── verifyToken ────────────────────────────────────────────────
  describe('verifyToken', () => {
    it('deve resolver sem erro quando o token esta valido', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());

      await expect(service.verifyToken({ token: TOKEN })).resolves.toBeUndefined();
    });

    it('nao deve consumir o token ao verificar', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());

      await service.verifyToken({ token: TOKEN });

      expect(prismaMock.passwordResetRequest.update).not.toHaveBeenCalled();
    });

    it('deve lancar BadRequestException quando o token nao existe', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(null);

      await expect(service.verifyToken({ token: TOKEN })).rejects.toThrow(BadRequestException);
    });

    it('deve lancar ConflictException quando o token ja foi utilizado', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow({ usedAt: new Date() }));

      await expect(service.verifyToken({ token: TOKEN })).rejects.toThrow(ConflictException);
    });

    it('deve lancar GoneException quando o token expirou', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(
        buildRequestRow({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.verifyToken({ token: TOKEN })).rejects.toThrow(GoneException);
    });

    it('deve priorizar "ja utilizado" sobre "expirado" quando o token tem os dois estados', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(
        buildRequestRow({ usedAt: new Date(), expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.verifyToken({ token: TOKEN })).rejects.toThrow(ConflictException);
    });
  });

  // ── resetPassword ──────────────────────────────────────────────
  describe('resetPassword', () => {
    const dto = { token: TOKEN, newPassword: 'NovaSenha@123' };

    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({ isActive: true } as never);
    });

    it('deve gravar o hash novo, limpar o refresh token e incrementar a versao de sessao', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());

      await service.resetPassword(dto);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          passwordHash: 'novo-hash',
          mustChangePassword: false,
          refreshTokenHash: null,
          sessionVersion: { increment: 1 },
        },
      });
    });

    it('deve marcar o token como utilizado', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());

      await service.resetPassword(dto);

      expect(prismaMock.passwordResetRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { usedAt: expect.any(Date) as Date },
      });
    });

    it('deve registrar a redefinicao no audit log', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());

      await service.resetPassword(dto);
      await flushPendingWork();

      expect(auditLogMock.log).toHaveBeenCalledWith(
        'UPDATE',
        'User',
        USER_ID,
        USER_ID,
        expect.objectContaining({ newValues: expect.objectContaining({ passwordReset: true }) }),
      );
    });

    it('deve lancar GoneException sem alterar a senha quando o token expirou', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(
        buildRequestRow({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      await expect(service.resetPassword(dto)).rejects.toThrow(GoneException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('deve lancar ConflictException quando o token ja foi utilizado', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow({ usedAt: new Date() }));

      await expect(service.resetPassword(dto)).rejects.toThrow(ConflictException);
    });

    it('deve recusar a redefinicao quando a conta foi desativada dentro da validade do link', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());
      prismaMock.user.findUnique.mockResolvedValue({ isActive: false } as never);

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('deve recusar a redefinicao quando a conta nao existe mais', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow());
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('deve lancar BadRequestException quando a solicitacao nao aponta para um usuario', async () => {
      prismaMock.passwordResetRequest.findUnique.mockResolvedValue(buildRequestRow({ userId: null }));

      await expect(service.resetPassword(dto)).rejects.toThrow(BadRequestException);
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  // ── purgeStaleRequests ─────────────────────────────────────────
  describe('purgeStaleRequests', () => {
    it('deve apagar solicitacoes mais antigas que a retencao', async () => {
      prismaMock.passwordResetRequest.deleteMany.mockResolvedValue({ count: 4 });

      await service.purgeStaleRequests();

      expect(prismaMock.passwordResetRequest.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) as Date } },
      });
    });

    it('nao deve deixar o cron estourar excecao quando o banco falha', async () => {
      prismaMock.passwordResetRequest.deleteMany.mockRejectedValue(new Error('conexao perdida'));

      // Exceção que escapa do cron sai por `console.error` da lib `cron` — fora
      // do Pino e invisível no log estruturado.
      await expect(service.handlePurgeCron()).resolves.toBeUndefined();
    });
  });
});
