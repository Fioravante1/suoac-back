import * as crypto from 'crypto';
import { BadRequestException, ConflictException, GoneException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailSender } from '../common/email/email-sender';
import { HashingService } from '../common/hashing/hashing.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { CIRCUIT_SIGNUP } from './circuit-signup.constants';
import { CircuitSignupService } from './circuit-signup.service';
import type { ConfirmCircuitSignupDto } from './dto/confirm-circuit-signup.dto';
import type { CreateCircuitSignupDto } from './dto/create-circuit-signup.dto';

// ── Types ────────────────────────────────────────────────────────
interface PrismaSignupRow {
  id: string;
  email: string;
  codeHash: string | null;
  payload: unknown;
  attempts: number;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}

// ── Constants ────────────────────────────────────────────────────
const REQUEST_ID = 'r1r2r3r4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'g1g2g3g4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const EMAIL = 'joao@example.com';
const CODE = '042137';
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=1$fake$hash';

// ── Helpers ──────────────────────────────────────────────────────
function buildDto(overrides: Partial<CreateCircuitSignupDto> = {}): CreateCircuitSignupDto {
  return {
    coordinator: {
      name: 'João Silva',
      email: EMAIL,
      phone: '11987654321',
      password: 'Senha-Segura123',
      ...overrides.coordinator,
    },
    circuit: {
      name: 'SP-17',
      city: 'São Paulo',
      state: 'SP',
      ...overrides.circuit,
    },
    congregations: overrides.congregations ?? [
      { code: 'SP17-CENTRAL', name: 'Central' },
      { code: 'SP17-JARDIM', name: 'Jardim' },
    ],
    termsVersion: overrides.termsVersion,
  };
}

/** O serviço guarda o SHA-256 de `email:code` — nunca o código em claro. */
function hashCode(email: string, code: string): string {
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
}

function buildPayload(): Record<string, unknown> {
  return {
    coordinator: { name: 'João Silva', email: EMAIL, phone: '11987654321', passwordHash: PASSWORD_HASH },
    circuit: { name: 'SP-17', city: 'São Paulo', state: 'SP' },
    congregations: [
      { code: 'SP17-CENTRAL', name: 'Central' },
      { code: 'SP17-JARDIM', name: 'Jardim' },
    ],
  };
}

/**
 * `null` é valor significativo em quase todo campo desta linha — rascunho sem
 * código, sem expiração, sem uso —, então os defaults só entram quando a chave
 * está ausente, e não quando vem nula.
 */
function buildSignupRow(overrides: Partial<PrismaSignupRow> = {}): PrismaSignupRow {
  return {
    id: REQUEST_ID,
    email: EMAIL,
    codeHash: hashCode(EMAIL, CODE),
    payload: buildPayload(),
    attempts: 0,
    expiresAt: new Date(Date.now() + CIRCUIT_SIGNUP.CODE_TTL_MS),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildCreatedUser(): Record<string, unknown> {
  return {
    id: USER_ID,
    name: 'João Silva',
    email: EMAIL,
    phone: '11987654321',
    role: 'CIRCUIT_COORDINATOR',
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 0,
    circuitId: CIRCUIT_ID,
    congregationId: CONGREGATION_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function confirmDto(overrides: Partial<ConfirmCircuitSignupDto> = {}): ConfirmCircuitSignupDto {
  return { email: EMAIL, code: CODE, ...overrides };
}

/** Deixa o envio disparado sem `await` terminar antes da asserção. */
async function flushPendingWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CircuitSignupService', () => {
  let service: CircuitSignupService;
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
      issueSession: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: USER_ID },
      }),
    };
    auditLogMock = { log: jest.fn().mockResolvedValue(undefined) };

    const configMock = { get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        CircuitSignupService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: HashingService, useValue: hashingMock },
        { provide: EmailSender, useValue: emailSenderMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: AuditLogService, useValue: auditLogMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(CircuitSignupService);

    // Caminho livre por padrão: nenhum e-mail, circuito ou congregação já em uso.
    prismaMock.circuitSignupRequest.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.circuit.findFirst.mockResolvedValue(null);
    prismaMock.congregation.findMany.mockResolvedValue([] as never);

    // `requestSignup` e `consolidate` rodam em transações interativas; sem isto o
    // callback — que é onde está toda a lógica — nunca seria executado pelo mock.
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: DeepMockProxy<PrismaClientType>) => Promise<unknown>)(prismaMock);
      }
      return Promise.resolve([]);
    });
  });

  // ── requestSignup ──────────────────────────────────────────────
  describe('requestSignup', () => {
    it('deve guardar o rascunho e enviar o código quando nada está em uso', async () => {
      await service.requestSignup(buildDto());
      await flushPendingWork();

      expect(prismaMock.circuitSignupRequest.create).toHaveBeenCalledTimes(1);
      expect(emailSenderMock.send).toHaveBeenCalledTimes(1);
    });

    it('nao deve criar circuito, congregacao nem usuario antes da confirmacao', async () => {
      await service.requestSignup(buildDto());
      await flushPendingWork();

      // É a promessa central do desenho: até o código ser digitado, o circuito
      // não existe e nenhum código fica reservado.
      expect(prismaMock.circuit.create).not.toHaveBeenCalled();
      expect(prismaMock.congregation.create).not.toHaveBeenCalled();
      expect(prismaMock.congregation.createMany).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('deve guardar a senha ja hasheada, nunca em claro', async () => {
      await service.requestSignup(buildDto());

      expect(hashingMock.hash).toHaveBeenCalledWith('Senha-Segura123');

      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      const payload = createCall?.data.payload as { coordinator: { passwordHash: string } };

      expect(payload.coordinator.passwordHash).toBe(PASSWORD_HASH);
      expect(JSON.stringify(createCall?.data.payload)).not.toContain('Senha-Segura123');
    });

    it('deve guardar o rascunho no formato canonico sem code', async () => {
      await service.requestSignup(buildDto());

      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      const payload = createCall?.data.payload as { circuit: Record<string, unknown> };

      expect(payload.circuit).toEqual({ name: 'SP-17', city: 'São Paulo', state: 'SP' });
      expect(payload.circuit).not.toHaveProperty('code');
    });

    it('deve guardar o aceite dos termos no rascunho, com o momento da solicitacao', async () => {
      const before = Date.now();

      await service.requestSignup(buildDto({ termsVersion: '2026-10-25' }));

      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      const payload = createCall?.data.payload as { terms: { version: string; acceptedAt: string } };

      expect(payload.terms.version).toBe('2026-10-25');
      expect(new Date(payload.terms.acceptedAt).getTime()).toBeGreaterThanOrEqual(before);
    });

    it('nao deve inventar aceite quando o cliente nao envia a versao', async () => {
      await service.requestSignup(buildDto());

      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      const payload = createCall?.data.payload as Record<string, unknown>;

      expect(payload.terms).toBeUndefined();
    });

    it('deve converter o code legado no name canonico do rascunho', async () => {
      await service.requestSignup(
        buildDto({ circuit: { code: 'SP-18', name: 'Circuito São Paulo 18', city: 'São Paulo', state: 'SP' } }),
      );

      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      const payload = createCall?.data.payload as { circuit: Record<string, unknown> };

      expect(payload.circuit.name).toBe('SP-18');
      expect(payload.circuit).not.toHaveProperty('code');
    });

    it('nao deve gravar o codigo em claro, apenas o hash', async () => {
      await service.requestSignup(buildDto());
      await flushPendingWork();

      const sentText = emailSenderMock.send.mock.calls[0]?.[0]?.text ?? '';
      const codeMatch = /\b\d{6}\b/.exec(sentText);
      const sentCode = codeMatch?.[0];
      const storedHash = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0]?.data.codeHash;

      expect(sentCode).toBeDefined();
      expect(storedHash).toBe(hashCode(EMAIL, sentCode ?? ''));
      expect(storedHash).not.toBe(sentCode);
    });

    it('deve serializar a contagem e a insercao numa transacao com lock por e-mail', async () => {
      await service.requestSignup(buildDto());

      // Sem a transação com lock, requisições concorrentes leriam a mesma
      // contagem antiga e todas passariam pelo limite.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('deve lancar 409 com o campo do e-mail quando a conta ja existe', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID } as never);

      await expect(service.requestSignup(buildDto())).rejects.toThrow(ConflictException);
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('deve lancar 409 com o campo canonico quando o circuito ja existe', async () => {
      prismaMock.circuit.findFirst.mockResolvedValue({ id: CIRCUIT_ID } as never);

      await expect(service.requestSignup(buildDto())).rejects.toMatchObject({
        response: { field: 'circuit.name' },
      });
    });

    it('deve manter o campo legado para um cliente que ainda envia code', async () => {
      prismaMock.circuit.findFirst.mockResolvedValue({ id: CIRCUIT_ID } as never);

      await expect(
        service.requestSignup(
          buildDto({ circuit: { code: 'SP-17', name: 'Circuito São Paulo 17', city: 'São Paulo', state: 'SP' } }),
        ),
      ).rejects.toMatchObject({
        response: { field: 'circuit.code' },
      });
    });

    it('deve apontar a linha da congregacao cujo codigo ja esta em uso', async () => {
      prismaMock.congregation.findMany.mockResolvedValue([{ code: 'SP17-JARDIM' }] as never);

      await expect(service.requestSignup(buildDto())).rejects.toMatchObject({
        response: { field: 'congregations.1.code' },
      });
    });

    it('deve reportar todos os conflitos de uma vez, nao o primeiro', async () => {
      // Um conflito por envio obrigava o usuário a gastar uma ficha do limite
      // por e-mail para descobrir cada problema — com quatro conflitos, ele
      // ficava sem orçamento antes de conseguir corrigir tudo.
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID } as never);
      prismaMock.circuit.findFirst.mockResolvedValue({ id: CIRCUIT_ID } as never);
      prismaMock.congregation.findMany.mockResolvedValue([{ code: 'SP17-JARDIM' }] as never);

      await expect(service.requestSignup(buildDto())).rejects.toMatchObject({
        response: {
          fields: [{ field: 'coordinator.email' }, { field: 'circuit.name' }, { field: 'congregations.1.code' }],
        },
      });
    });

    it('deve manter field apontando o primeiro conflito, para quem le so um', async () => {
      prismaMock.circuit.findFirst.mockResolvedValue({ id: CIRCUIT_ID } as never);

      await expect(service.requestSignup(buildDto())).rejects.toMatchObject({
        response: { field: 'circuit.name' },
      });
    });

    it('deve gastar uma unica tentativa do limite ao reportar varios conflitos', async () => {
      prismaMock.circuit.findFirst.mockResolvedValue({ id: CIRCUIT_ID } as never);
      prismaMock.congregation.findMany.mockResolvedValue([{ code: 'SP17-CENTRAL' }] as never);

      await expect(service.requestSignup(buildDto())).rejects.toThrow(ConflictException);

      expect(prismaMock.circuitSignupRequest.create).toHaveBeenCalledTimes(1);
    });

    it('deve registrar a tentativa recusada, sem guardar o payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID } as never);

      await expect(service.requestSignup(buildDto())).rejects.toThrow(ConflictException);

      // A linha entra na contagem do limite por e-mail; os dados de um cadastro
      // recusado não ficam guardados.
      const createCall = prismaMock.circuitSignupRequest.create.mock.calls[0]?.[0];
      expect(createCall?.data).toEqual({ email: EMAIL });
    });

    it('deve lancar 422 quando o mesmo codigo de congregacao aparece duas vezes', async () => {
      const dto = buildDto({
        congregations: [
          { code: 'SP17-CENTRAL', name: 'Central' },
          { code: 'SP17-CENTRAL', name: 'Outra' },
        ],
      });

      await expect(service.requestSignup(dto)).rejects.toMatchObject({
        response: { field: 'congregations.1.code' },
      });

      // Duplicata interna não depende do banco: nem o hash da senha é calculado.
      expect(hashingMock.hash).not.toHaveBeenCalled();
    });

    it('deve lancar 429 quando o limite por e-mail foi atingido', async () => {
      prismaMock.circuitSignupRequest.count.mockResolvedValue(CIRCUIT_SIGNUP.RATE_LIMIT_DEFAULT_MAX);

      await expect(service.requestSignup(buildDto())).rejects.toThrow(HttpException);
      expect(emailSenderMock.send).not.toHaveBeenCalled();
    });

    it('nao deve gastar Argon2 numa requisicao que ja esta por cima do limite', async () => {
      prismaMock.circuitSignupRequest.count.mockResolvedValue(CIRCUIT_SIGNUP.RATE_LIMIT_DEFAULT_MAX);

      await expect(service.requestSignup(buildDto())).rejects.toThrow(HttpException);

      // Argon2 com 64 MiB por chamada, num endpoint público e fora do limiter
      // por IP, é um amplificador de carga barato para quem chama.
      expect(hashingMock.hash).not.toHaveBeenCalled();
    });

    it('deve contar tambem as tentativas recusadas no limite por e-mail', async () => {
      await service.requestSignup(buildDto());

      // Contar só as aceitas deixaria sondar e-mails à vontade: cada recusa
      // sairia de graça.
      expect(prismaMock.circuitSignupRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ email: EMAIL }) }),
      );
    });

    it('deve responder mesmo quando o envio do e-mail falha', async () => {
      emailSenderMock.send.mockRejectedValue(new Error('provedor fora'));

      // O rascunho já existe e a tela oferece reenviar; derrubar a resposta aqui
      // faria o usuário recomeçar um cadastro que foi aceito.
      await expect(service.requestSignup(buildDto())).resolves.toBeUndefined();
      await flushPendingWork();
    });
  });

  // ── confirmSignup ──────────────────────────────────────────────
  describe('confirmSignup', () => {
    beforeEach(() => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(buildSignupRow() as never);
      prismaMock.circuitSignupRequest.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.circuit.create.mockResolvedValue({ id: CIRCUIT_ID } as never);
      prismaMock.congregation.create.mockResolvedValue({ id: CONGREGATION_ID } as never);
      prismaMock.congregation.createMany.mockResolvedValue({ count: 1 });
      prismaMock.user.create.mockResolvedValue(buildCreatedUser() as never);
    });

    it('deve criar circuito, congregacoes e coordenador na mesma transacao', async () => {
      await service.confirmSignup(confirmDto());

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.circuit.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.congregation.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.congregation.createMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    });

    it('deve fazer dupla escrita interna do identificador durante a transicao', async () => {
      await service.confirmSignup(confirmDto());

      expect(prismaMock.circuit.create).toHaveBeenCalledWith({
        data: { code: 'SP-17', name: 'SP-17', city: 'São Paulo', state: 'SP' },
      });
    });

    it('deve ligar o coordenador a primeira congregacao da lista', async () => {
      await service.confirmSignup(confirmDto());

      // A primeira linha da etapa 3 é "sua congregação" — é ela que vai para o
      // `congregationId` do usuário.
      expect(prismaMock.congregation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ code: 'SP17-CENTRAL' }) }),
      );
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ congregationId: CONGREGATION_ID }) }),
      );
    });

    it('deve criar o coordenador com o papel de coordenador de circuito', async () => {
      await service.confirmSignup(confirmDto());

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'CIRCUIT_COORDINATOR' }) }),
      );
    });

    it('deve gravar no coordenador o aceite feito na solicitacao, nao a hora da confirmacao', async () => {
      const acceptedAt = '2026-10-25T12:00:00.000Z';
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(
        buildSignupRow({ payload: { ...buildPayload(), terms: { version: '2026-10-25', acceptedAt } } }) as never,
      );

      await service.confirmSignup(confirmDto());

      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ termsVersion: '2026-10-25', termsAcceptedAt: new Date(acceptedAt) }),
        }),
      );
    });

    it('deve criar o coordenador sem aceite quando o rascunho nao traz a versao', async () => {
      await service.confirmSignup(confirmDto());

      const { data } = prismaMock.user.create.mock.calls[0]?.[0] ?? { data: {} };

      expect((data as { termsVersion?: string }).termsVersion).toBeUndefined();
      expect((data as { termsAcceptedAt?: Date }).termsAcceptedAt).toBeUndefined();
    });

    it('deve reaproveitar a senha hasheada do rascunho, sem hashear de novo', async () => {
      await service.confirmSignup(confirmDto());

      expect(hashingMock.hash).not.toHaveBeenCalled();
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: PASSWORD_HASH }) }),
      );
    });

    it('deve devolver sessao autenticada para a tela de sucesso', async () => {
      const result = await service.confirmSignup(confirmDto());

      expect(authServiceMock.issueSession).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('nao deve criar nada quando outra confirmacao consumiu o rascunho primeiro', async () => {
      prismaMock.circuitSignupRequest.updateMany.mockResolvedValue({ count: 0 });

      // É o duplo clique: o rascunho é marcado como usado dentro da transação, e
      // quem perde a corrida para antes de criar qualquer coisa.
      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(ConflictException);
      expect(prismaMock.circuit.create).not.toHaveBeenCalled();
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('deve marcar o rascunho como usado antes de criar o circuito', async () => {
      const order: string[] = [];
      prismaMock.circuitSignupRequest.updateMany.mockImplementation((() => {
        order.push('claim');
        return Promise.resolve({ count: 1 });
      }) as never);
      prismaMock.circuit.create.mockImplementation((() => {
        order.push('circuit');
        return Promise.resolve({ id: CIRCUIT_ID });
      }) as never);

      await service.confirmSignup(confirmDto());

      expect(order).toEqual(['claim', 'circuit']);
    });

    it('deve lancar 400 quando o codigo nao confere', async () => {
      await expect(service.confirmSignup(confirmDto({ code: '999999' }))).rejects.toThrow(BadRequestException);
      expect(prismaMock.circuit.create).not.toHaveBeenCalled();
    });

    it('deve contar a tentativa errada no rascunho', async () => {
      await expect(service.confirmSignup(confirmDto({ code: '999999' }))).rejects.toThrow(BadRequestException);

      // Sem o contador, seis dígitos caem por força bruta: o limite por e-mail
      // cobre o envio, não o chute.
      expect(prismaMock.circuitSignupRequest.updateMany).toHaveBeenCalledWith({
        where: { id: REQUEST_ID, attempts: { lt: CIRCUIT_SIGNUP.MAX_CODE_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
    });

    it('deve impor o teto de tentativas no proprio UPDATE, nao no valor lido', async () => {
      // Ler `attempts` e depois incrementar deixa o teto passável: chamadas
      // concorrentes leriam todas o mesmo valor e todas ganhariam um chute. Esta
      // rota fica fora do limiter estrito por IP (BFF), então um lote de
      // requisições renderia muito mais chutes do que o teto promete.
      prismaMock.circuitSignupRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmSignup(confirmDto({ code: '999999' }))).rejects.toThrow(GoneException);
    });

    it('deve lancar 400 quando nao existe rascunho para o e-mail', async () => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(null);

      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(BadRequestException);
    });

    it('deve lancar 409 quando o cadastro ja foi confirmado', async () => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(buildSignupRow({ usedAt: new Date() }) as never);

      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(ConflictException);
    });

    it('deve lancar 410 quando o codigo expirou', async () => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(
        buildSignupRow({ expiresAt: new Date(Date.now() - 1_000) }) as never,
      );

      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(GoneException);
    });

    it('deve lancar 410 quando as tentativas se esgotaram', async () => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(
        buildSignupRow({ attempts: CIRCUIT_SIGNUP.MAX_CODE_ATTEMPTS }) as never,
      );

      // O rascunho virou inútil, não só a tentativa: a tela trata `410` como
      // "recomece o cadastro", que é o caminho correto daqui.
      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(GoneException);
      expect(prismaMock.circuit.create).not.toHaveBeenCalled();
    });

    /**
     * A forma do `P2002` aqui não é inventada: é a que o Prisma 7 com
     * `@prisma/adapter-pg` produz de verdade, verificada contra o banco. Não há
     * `meta.target` — o campo violado vem de
     * `meta.driverAdapterError.cause.constraint.fields`.
     */
    function uniqueViolation(model: string, field: string): Error {
      return Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: {
          modelName: model,
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { kind: 'UniqueConstraintViolation', constraint: { fields: [field] } },
          },
        },
      });
    }

    it('deve traduzir a constraint legada para o campo canonico', async () => {
      prismaMock.circuit.create.mockRejectedValue(uniqueViolation('Circuit', 'code'));

      await expect(service.confirmSignup(confirmDto())).rejects.toMatchObject({
        response: { field: 'circuit.name' },
      });
    });

    it('deve traduzir a constraint canonica para o mesmo campo', async () => {
      prismaMock.circuit.create.mockRejectedValue(uniqueViolation('Circuit', 'name'));

      await expect(service.confirmSignup(confirmDto())).rejects.toMatchObject({
        response: { field: 'circuit.name' },
      });
    });

    it('deve apontar o e-mail quando a colisao e do usuario', async () => {
      prismaMock.user.create.mockRejectedValue(uniqueViolation('User', 'email'));

      await expect(service.confirmSignup(confirmDto())).rejects.toMatchObject({
        response: { field: 'coordinator.email' },
      });
    });

    it('deve apontar as congregacoes quando a colisao e de congregacao', async () => {
      prismaMock.congregation.create.mockRejectedValue(uniqueViolation('Congregation', 'code'));

      await expect(service.confirmSignup(confirmDto())).rejects.toMatchObject({
        response: { field: 'congregations' },
      });
    });

    it('deve aceitar tambem a forma com meta.target, de quando nao ha driver adapter', async () => {
      prismaMock.circuit.create.mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002', meta: { modelName: 'Circuit', target: ['name'] } }),
      );

      await expect(service.confirmSignup(confirmDto())).rejects.toMatchObject({
        response: { field: 'circuit.name' },
      });
    });

    it('deve responder 409 mesmo quando a forma do P2002 e desconhecida', async () => {
      // Sem reconhecer a forma, o erro passaria cru e viraria a mensagem
      // genérica do filtro — que era o comportamento real antes desta correção.
      prismaMock.circuit.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002', meta: {} }));

      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(ConflictException);
    });

    it('deve esvaziar o payload do rascunho ao consolidar', async () => {
      await service.confirmSignup(confirmDto());

      // Os dados já vivem em `users`, `circuits` e `congregations`; mantê-los no
      // rascunho guardaria nome, e-mail, telefone e hash de senha por mais 7
      // dias sem motivo.
      const claim = prismaMock.circuitSignupRequest.updateMany.mock.calls[0]?.[0];

      expect(claim?.data).toHaveProperty('payload');
      expect(JSON.stringify(claim?.data)).not.toContain(PASSWORD_HASH);
    });

    it('deve preservar o codeHash ao consolidar, para o duplo clique achar o rascunho', async () => {
      await service.confirmSignup(confirmDto());

      // Limpar o hash faria `findPendingRequest` não reencontrar a linha usada, e
      // a segunda chamada responderia 400 como se o código fosse inválido.
      const claim = prismaMock.circuitSignupRequest.updateMany.mock.calls[0]?.[0];

      expect(claim?.data).not.toHaveProperty('codeHash');
    });

    it('deve recusar rascunho corrompido em vez de criar cadastro pela metade', async () => {
      prismaMock.circuitSignupRequest.findFirst.mockResolvedValue(
        buildSignupRow({ payload: { circuit: { code: 'SP-17' } } }) as never,
      );

      await expect(service.confirmSignup(confirmDto())).rejects.toThrow(/Rascunho de autocadastro invalido/);
      expect(prismaMock.circuit.create).not.toHaveBeenCalled();
    });

    it('deve buscar sempre o rascunho mais recente com codigo emitido', async () => {
      await service.confirmSignup(confirmDto());

      // Pedir o reenvio aposenta o rascunho anterior sem precisar apagá-lo, e as
      // linhas sem código existem só para a contagem do limite.
      expect(prismaMock.circuitSignupRequest.findFirst).toHaveBeenCalledWith({
        where: { email: EMAIL, codeHash: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ── purgeStaleRequests ─────────────────────────────────────────
  describe('purgeStaleRequests', () => {
    it('deve apagar os rascunhos mais velhos que a retencao', async () => {
      prismaMock.circuitSignupRequest.deleteMany.mockResolvedValue({ count: 3 });

      await service.purgeStaleRequests();

      expect(prismaMock.circuitSignupRequest.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) } },
      });
    });

    it('nao deve deixar a falha da purga escapar do cron', async () => {
      prismaMock.circuitSignupRequest.deleteMany.mockRejectedValue(new Error('banco fora'));

      // Exceção escapando daqui sairia por `console.error` da lib `cron`, fora do
      // Pino e invisível no log estruturado.
      await expect(service.handlePurgeCron()).resolves.toBeUndefined();
    });
  });
});
