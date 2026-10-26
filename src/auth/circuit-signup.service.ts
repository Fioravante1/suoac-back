import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Prisma } from '../generated/prisma/client';
import { EmailSender } from '../common/email/email-sender';
import { HashingService } from '../common/hashing/hashing.service';
import { normalizeEmail } from '../common/validators/email.transform';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { buildCircuitSignupEmail } from './circuit-signup-email.template';
import { parseCircuitSignupPayload } from './circuit-signup-payload.parser';
import { CIRCUIT_SIGNUP } from './circuit-signup.constants';
import type { ConfirmCircuitSignupDto } from './dto/confirm-circuit-signup.dto';
import type { CreateCircuitSignupDto } from './dto/create-circuit-signup.dto';
import type { AuthResponse } from './interfaces/auth-response.interface';
import type { CircuitSignupPayload } from './interfaces/circuit-signup-payload.interface';
import type { SessionUser } from './interfaces/session-user.interface';

/** Client dentro de uma transação interativa do Prisma. */
type PrismaTransaction = Parameters<Parameters<PrismaService['client']['$transaction']>[0]>[0];

/** Campo do payload que causou o conflito, no caminho que o frontend usa. */
interface SignupConflict {
  field: string;
  message: string;
}

/** Constraint única violada, já normalizada a partir do erro do Prisma. */
interface UniqueViolation {
  model: string;
  fields: string[];
}

interface PendingRequest {
  id: string;
  codeHash: string;
  attempts: number;
  payload: unknown;
}

/**
 * Autocadastro de circuito: a porta de entrada de um circuito novo, chamada por
 * alguém que ainda não tem conta.
 *
 * O fluxo tem dois passos, e o motivo está no SUC-37. No primeiro, o cadastro
 * inteiro é validado e guardado como **rascunho**, com a senha já em Argon2 e um
 * código de 6 dígitos enviado por e-mail. No segundo, o código consolida tudo —
 * circuito, congregações e usuário coordenador — numa transação só.
 *
 * Antes da confirmação **nada existe**: nenhum circuito meio-criado, nenhum
 * código de circuito reservado. Abandonar o fluxo deixa uma linha de rascunho
 * que expira e é purgada.
 */
@Injectable()
export class CircuitSignupService {
  private readonly logger = new Logger(CircuitSignupService.name);
  private readonly maxRequestsPerWindow: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    private readonly emailSender: EmailSender,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    config: ConfigService,
  ) {
    const configuredMax = parseInt(config.get<string>('CIRCUIT_SIGNUP_MAX_PER_HOUR') ?? '', 10);
    this.maxRequestsPerWindow =
      Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : CIRCUIT_SIGNUP.RATE_LIMIT_DEFAULT_MAX;
  }

  /**
   * Valida o cadastro, guarda o rascunho e envia o código de confirmação.
   *
   * Chamar de novo com o mesmo e-mail é o "reenviar" da tela: o rascunho novo
   * passa a ser o válido, porque a confirmação sempre olha o mais recente.
   */
  async requestSignup(dto: CreateCircuitSignupDto): Promise<void> {
    const email = dto.coordinator.email;
    const circuitName = this.resolveCircuitName(dto);

    // Duplicata dentro do próprio payload não depende do banco: o usuário
    // repetiu um código na lista de congregações.
    this.assertNoRepeatedCongregationCode(dto);

    // Freio barato antes do Argon2. O limite que vale é o de dentro da
    // transação, abaixo; esta contagem é só para não gastar 64 MiB e dezenas de
    // milissegundos de hashing numa requisição que já está por cima do teto —
    // num endpoint público e fora do limiter estrito por IP, isso é um
    // amplificador barato de carga para quem chama.
    //
    // Não é autoritativa de propósito: aqui ela corre fora de transação e sem
    // lock, então duas requisições simultâneas podem passar as duas. Quem
    // recusa de verdade é `assertWithinRateLimit` lá dentro.
    await this.assertWithinRateLimit(this.prisma.client, email);

    // O hash fica fora da transação de propósito: Argon2 com 64 MiB e 3
    // iterações custa dezenas de milissegundos, e segurar o advisory lock do
    // e-mail durante esse tempo serializaria tentativas que não precisam
    // esperar uma pela outra.
    const passwordHash = await this.hashingService.hash(dto.coordinator.password);

    // Contagem e inserção na mesma transação, serializadas por e-mail com um
    // advisory lock — mesmo motivo de `PasswordResetService.requestReset`:
    // checar e depois inserir em chamadas separadas deixaria o limite passável
    // por requisições concorrentes, e este contador é a única defesa do fluxo
    // (não há limite por IP aqui, ver SUC-47).
    const outcome = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;

      await this.assertWithinRateLimit(tx, email);

      const conflicts = await this.findConflicts(tx, dto, circuitName);

      if (conflicts.length > 0) {
        // Linha sem `codeHash` e sem `payload`: a tentativa entra na contagem do
        // limite por e-mail, e os dados de um cadastro recusado não ficam
        // guardados sem motivo.
        await tx.circuitSignupRequest.create({ data: { email } });
        return { status: 'conflict', conflicts } as const;
      }

      const code = this.generateCode();

      await tx.circuitSignupRequest.create({
        data: {
          email,
          codeHash: this.hashCode(email, code),
          payload: this.buildPayload(dto, passwordHash, circuitName),
          expiresAt: new Date(Date.now() + CIRCUIT_SIGNUP.CODE_TTL_MS),
        },
      });

      return { status: 'issued', code } as const;
    });

    if (outcome.status === 'conflict') {
      const fields = outcome.conflicts.map((conflict) => conflict.field).join(',');
      this.logger.warn(`Autocadastro recusado por conflito — fields=${fields} email="${email}"`);
      throw new ConflictException(this.buildConflictBody(outcome.conflicts));
    }

    this.logger.log(`Rascunho de autocadastro criado — circuitName=${circuitName}`);

    // Envio depois do commit e fora do request, como na recuperação de senha:
    // esperar o provedor atrasaria a resposta sem nenhum ganho para quem chamou.
    void this.deliver(email, dto.coordinator.name, outcome.code, circuitName);
  }

  /**
   * Confirma o código e consolida o cadastro. Devolve sessão autenticada, para
   * a tela de sucesso entrar no painel sem passar pelo login.
   */
  async confirmSignup(dto: ConfirmCircuitSignupDto): Promise<AuthResponse> {
    const request = await this.findPendingRequest(dto.email);
    const payload = this.readPayload(request);

    if (!this.codeMatches(request.codeHash, dto.email, dto.code)) {
      await this.registerFailedAttempt(request, dto.email);
      throw new BadRequestException('Codigo de confirmacao invalido');
    }

    const user = await this.consolidate(request.id, payload);
    const session = await this.authService.issueSession(user);

    this.logger.log(`Autocadastro consolidado — circuitId=${user.circuitId} userId=${user.id}`);

    void this.auditLogService
      .log('CREATE', 'Circuit', user.circuitId, user.id, {
        oldValues: null,
        newValues: { circuitName: payload.circuit.name, congregations: payload.congregations.length, selfSignup: true },
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: user.circuitId }, 'Falha ao gravar audit log'));

    return session;
  }

  /**
   * Remove rascunhos antigos. Depois da janela do limite por e-mail eles são
   * apenas cadastros abandonados guardados sem motivo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'circuit-signup-purge' })
  async handlePurgeCron(): Promise<void> {
    // O `@nestjs/schedule` não recebe errorHandler, então uma exceção que escape
    // daqui sai por `console.error` da lib `cron` — fora do Pino e invisível no
    // log estruturado. Mesmo cuidado de `PasswordResetService`.
    try {
      await this.purgeStaleRequests();
    } catch (err: unknown) {
      this.logger.error({ err }, 'Falha ao purgar rascunhos de autocadastro');
    }
  }

  async purgeStaleRequests(): Promise<void> {
    const threshold = new Date(Date.now() - CIRCUIT_SIGNUP.RETENTION_MS);
    const { count } = await this.prisma.client.circuitSignupRequest.deleteMany({
      where: { createdAt: { lt: threshold } },
    });

    if (count > 0) {
      this.logger.log(`Rascunhos de autocadastro purgados — count=${count}`);
    }
  }

  /**
   * Cria circuito, congregações e coordenador de uma vez.
   *
   * O rascunho é marcado como usado **dentro** da mesma transação, e por isso
   * duplo clique não cria dois circuitos: a segunda chamada não encontra mais
   * rascunho pendente para consumir.
   */
  private async consolidate(requestId: string, payload: CircuitSignupPayload): Promise<SessionUser> {
    const [ownCongregation, ...otherCongregations] = payload.congregations;

    if (!ownCongregation) {
      this.logger.error(`Rascunho sem congregação do coordenador — requestId=${requestId}`);
      throw new InternalServerErrorException('Rascunho de autocadastro invalido');
    }

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        // O rascunho é consumido e o payload descartado na mesma escrita: depois
        // da consolidação os dados já vivem em `users`, `circuits` e
        // `congregations`, e mantê-los aqui guardaria nome, e-mail, telefone e
        // hash de senha por mais 7 dias sem motivo — o mesmo raciocínio que faz
        // a tentativa recusada não gravar payload.
        //
        // `codeHash` **fica**: é por ele que `findPendingRequest` reencontra o
        // rascunho já usado e responde `409` ao duplo clique, em vez de `400`
        // como se o código fosse inválido. Ele é o SHA-256 de um código de seis
        // dígitos já consumido, e a linha marcada com `usedAt` não pode ser
        // consolidada de novo.
        const claimed = await tx.circuitSignupRequest.updateMany({
          where: { id: requestId, usedAt: null },
          data: { usedAt: new Date(), payload: Prisma.DbNull },
        });

        // Duas confirmações simultâneas: a que perder a corrida vê zero linhas
        // atualizadas e para aqui, antes de criar qualquer coisa.
        if (claimed.count !== 1) {
          throw new ConflictException('Cadastro ja confirmado');
        }

        const circuit = await tx.circuit.create({
          data: {
            // Dupla escrita transitória: a versão anterior ainda protege a
            // unicidade pelo campo `code`. O contract SUC-60 remove a coluna.
            code: payload.circuit.name,
            name: payload.circuit.name,
            city: payload.circuit.city,
            state: payload.circuit.state,
          },
        });

        const congregation = await tx.congregation.create({
          data: { code: ownCongregation.code, name: ownCongregation.name, circuitId: circuit.id },
        });

        if (otherCongregations.length > 0) {
          await tx.congregation.createMany({
            data: otherCongregations.map((item) => ({ code: item.code, name: item.name, circuitId: circuit.id })),
          });
        }

        // O coordenador nasce ligado à própria congregação — é a primeira linha
        // da etapa 3, e é o que o desenho chama de "sua congregação".
        return tx.user.create({
          data: {
            name: payload.coordinator.name,
            email: payload.coordinator.email,
            phone: payload.coordinator.phone,
            passwordHash: payload.coordinator.passwordHash,
            role: 'CIRCUIT_COORDINATOR',
            circuitId: circuit.id,
            congregationId: congregation.id,
            termsAcceptedAt: payload.terms === undefined ? undefined : new Date(payload.terms.acceptedAt),
            termsVersion: payload.terms?.version,
          },
        });
      });
    } catch (err: unknown) {
      throw this.translateConsolidationError(err, payload);
    }
  }

  /**
   * Traduz violação de unicidade que só aparece na consolidação — o código de
   * circuito estava livre quando o rascunho nasceu e foi tomado por outro
   * cadastro nos 30 minutos seguintes.
   */
  private translateConsolidationError(err: unknown, payload: CircuitSignupPayload): unknown {
    const violation = this.uniqueViolation(err);

    if (!violation) {
      return err;
    }

    const conflict = this.conflictForViolation(violation, payload);

    this.logger.warn(`Consolidação recusada por unicidade — field=${conflict.field}`);

    return new ConflictException(this.buildConflictBody([conflict]));
  }

  private conflictForViolation(violation: UniqueViolation, payload: CircuitSignupPayload): SignupConflict {
    const { model, fields } = violation;

    if (model === 'User' && fields.includes('email')) {
      return { field: 'coordinator.email', message: 'Este e-mail ja esta cadastrado' };
    }

    // Durante a dupla escrita, a colisão pode vir de qualquer uma das duas
    // constraints. Para o contrato público ambas representam o mesmo campo.
    if (model === 'Circuit' && (fields.includes('code') || fields.includes('name'))) {
      return { field: 'circuit.name', message: 'Este circuito ja esta em uso' };
    }

    if (model === 'Congregation' && fields.includes('code')) {
      return {
        field: 'congregations',
        message: 'Um dos codigos de congregacao ja esta em uso por outra congregacao',
      };
    }

    this.logger.error(`Unicidade violada em campo não mapeado — model=${model} fields=${fields.join(',')}`);

    return { field: 'circuit.name', message: `Conflito ao criar o circuito ${payload.circuit.name}` };
  }

  /**
   * Descobre qual constraint única foi violada, sem importar os tipos de erro do
   * client gerado — `src/generated/` não é versionado, e a checagem estrutural
   * basta.
   *
   * **A forma vem do driver adapter, não do campo `meta.target`.** Sob Prisma 7
   * com `@prisma/adapter-pg`, o `P2002` chega **sem** `target`; o que ele traz é
   * `meta.modelName` e `meta.driverAdapterError.cause.constraint.fields`. Isto
   * foi verificado contra o banco, e não suposto: a primeira versão deste código
   * leu `meta.target`, nunca casou, e todo conflito de consolidação caía na
   * mensagem genérica do `AllExceptionsFilter`.
   *
   * `meta.target` ainda é lido como segunda tentativa, porque é a forma que o
   * Prisma emite sem driver adapter e a que volta se o adapter for trocado.
   */
  private uniqueViolation(err: unknown): UniqueViolation | null {
    if (typeof err !== 'object' || err === null) {
      return null;
    }

    const candidate = err as {
      code?: unknown;
      meta?: {
        modelName?: unknown;
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
      };
    };

    if (candidate.code !== 'P2002') {
      return null;
    }

    const model = typeof candidate.meta?.modelName === 'string' ? candidate.meta.modelName : '';
    const adapterFields = candidate.meta?.driverAdapterError?.cause?.constraint?.fields;

    if (Array.isArray(adapterFields)) {
      return { model, fields: adapterFields.map((item) => String(item)) };
    }

    const target = candidate.meta?.target;

    if (Array.isArray(target)) {
      return { model, fields: target.map((item) => String(item)) };
    }

    // É P2002, mas numa forma que este código não conhece. Devolver `null` aqui
    // deixaria o erro passar cru e virar a resposta genérica; melhor assumir o
    // conflito e seguir para o mapeamento, que registra o caso não previsto.
    return { model, fields: typeof target === 'string' ? [target] : [] };
  }

  private async findPendingRequest(email: string): Promise<PendingRequest> {
    // O rascunho válido é sempre o **mais recente** com código emitido: pedir o
    // reenvio aposenta o anterior sem precisar apagá-lo, e as linhas sem código
    // (tentativas recusadas) existem só para a contagem do limite por e-mail.
    const request = await this.prisma.client.circuitSignupRequest.findFirst({
      where: { email, codeHash: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!request?.codeHash) {
      this.logger.warn(`Confirmação sem rascunho correspondente — email="${email}"`);
      throw new BadRequestException('Codigo de confirmacao invalido');
    }

    if (request.usedAt) {
      this.logger.warn(`Rascunho já consolidado — requestId=${request.id}`);
      throw new ConflictException('Cadastro ja confirmado');
    }

    if (!request.expiresAt || request.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(`Rascunho expirado — requestId=${request.id}`);
      throw new GoneException('Codigo de confirmacao expirado');
    }

    // Esgotar as tentativas mata o rascunho, não apenas a tentativa: responde
    // como expirado porque é o que o rascunho virou — inútil. A tela trata `410`
    // como "recomece o cadastro", que é exatamente o caminho daqui.
    if (request.attempts >= CIRCUIT_SIGNUP.MAX_CODE_ATTEMPTS) {
      this.logger.warn(`Rascunho com tentativas esgotadas — requestId=${request.id}`);
      throw new GoneException('Codigo de confirmacao expirado');
    }

    return {
      id: request.id,
      codeHash: request.codeHash,
      attempts: request.attempts,
      payload: request.payload,
    };
  }

  private readPayload(request: PendingRequest): CircuitSignupPayload {
    try {
      return parseCircuitSignupPayload(request.payload);
    } catch (err: unknown) {
      this.logger.error({ err, requestId: request.id }, 'Rascunho de autocadastro corrompido');
      throw new InternalServerErrorException('Rascunho de autocadastro invalido');
    }
  }

  /**
   * Conta o chute errado, e é **aqui** que o teto de tentativas é imposto.
   *
   * O incremento é condicionado a `attempts < MAX` no próprio `UPDATE`, e não
   * calculado a partir do valor lido antes: ler e depois incrementar deixa o
   * teto passável por requisições concorrentes, que leriam todas o mesmo
   * `attempts`. Zero linhas atualizadas significa que outra tentativa já
   * estourou o teto — o rascunho está morto, e a resposta é a de rascunho
   * inútil, não a de código errado.
   */
  private async registerFailedAttempt(request: PendingRequest, email: string): Promise<void> {
    const { count } = await this.prisma.client.circuitSignupRequest.updateMany({
      where: { id: request.id, attempts: { lt: CIRCUIT_SIGNUP.MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });

    if (count !== 1) {
      this.logger.warn(`Tentativas esgotadas por chamada concorrente — requestId=${request.id}`);
      throw new GoneException('Codigo de confirmacao expirado');
    }

    this.logger.warn(`Código de confirmação incorreto — requestId=${request.id} email="${email}"`);
  }

  /**
   * Corpo do `409` de unicidade.
   *
   * `fields` carrega todos os conflitos, para a tela pintar os campos de uma vez
   * e o usuário corrigir tudo num envio. `field` e `message` continuam
   * apontando o primeiro, porque são o formato que o resto da API usa — quem só
   * sabe ler um campo continua funcionando.
   */
  private buildConflictBody(conflicts: SignupConflict[]): Record<string, unknown> {
    const [first] = conflicts;

    return {
      statusCode: HttpStatus.CONFLICT,
      message: first?.message ?? 'Alguns dados ja estao em uso',
      error: 'Conflict',
      field: first?.field,
      fields: conflicts,
    };
  }

  private assertNoRepeatedCongregationCode(dto: CreateCircuitSignupDto): void {
    const seen = new Set<string>();

    for (const [index, congregation] of dto.congregations.entries()) {
      if (seen.has(congregation.code)) {
        throw new UnprocessableEntityException({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: `O codigo ${congregation.code} aparece duas vezes na lista de congregacoes`,
          error: 'Unprocessable Entity',
          field: `congregations.${index}.code`,
        });
      }

      seen.add(congregation.code);
    }
  }

  /**
   * Primeira passada de unicidade, para o erro chegar na etapa 3 em vez de
   * depois do e-mail de confirmação. Não substitui a checagem do banco na
   * consolidação: entre uma e outra passam 30 minutos.
   *
   * Devolve **todos** os conflitos, não o primeiro. Parar no primeiro obrigava o
   * usuário a um envio por conflito descoberto, e cada envio gasta uma das
   * poucas fichas do limite por e-mail — quem tivesse código, nome e duas
   * congregações em uso ficava sem orçamento antes de conseguir corrigir tudo, e
   * travava por uma hora sem entender por quê.
   */
  private async findConflicts(
    tx: PrismaTransaction,
    dto: CreateCircuitSignupDto,
    circuitName: string,
  ): Promise<SignupConflict[]> {
    const conflicts: SignupConflict[] = [];

    // O e-mail do DTO já vem normalizado (minúsculas), como o banco exige: a busca
    // por igualdade usa o índice e ainda pega quem já tem conta como "Fulano@...".
    const existingUser = await tx.user.findUnique({
      where: { email: normalizeEmail(dto.coordinator.email) },
      select: { id: true },
    });

    if (existingUser) {
      conflicts.push({ field: 'coordinator.email', message: 'Este e-mail ja esta cadastrado' });
    }

    const existingCircuit = await tx.circuit.findFirst({
      where: {
        OR: [{ name: { equals: circuitName, mode: 'insensitive' } }, { code: circuitName }],
      },
      select: { id: true },
    });

    if (existingCircuit) {
      conflicts.push({ field: this.circuitConflictField(dto), message: 'Este circuito ja esta em uso' });
    }

    const codes = dto.congregations.map((congregation) => congregation.code);
    const takenCongregations = await tx.congregation.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const taken = new Set(takenCongregations.map((congregation) => congregation.code));

    for (const [index, congregation] of dto.congregations.entries()) {
      if (taken.has(congregation.code)) {
        // A unicidade de `Congregation.code` é global, não por circuito: o
        // código pode estar ocupado por uma congregação de outro circuito, e a
        // mensagem precisa deixar isso claro para quem está cadastrando.
        conflicts.push({
          field: `congregations.${index}.code`,
          message: `O codigo ${congregation.code} ja esta em uso por outra congregacao`,
        });
      }
    }

    return conflicts;
  }

  /**
   * Recusa quando o e-mail já estourou a janela.
   *
   * Recebe o client ou a transação: é chamada duas vezes por solicitação — uma
   * fora, como freio barato antes do Argon2, e outra dentro da transação com
   * lock, que é a que decide.
   */
  private async assertWithinRateLimit(tx: PrismaTransaction | PrismaService['client'], email: string): Promise<void> {
    const since = new Date(Date.now() - CIRCUIT_SIGNUP.RATE_LIMIT_WINDOW_MS);
    const recentRequests = await tx.circuitSignupRequest.count({
      where: { email, createdAt: { gte: since } },
    });

    if (recentRequests < this.maxRequestsPerWindow) {
      return;
    }

    this.logger.warn(`Limite de solicitações de autocadastro atingido — email="${email}"`);

    // O Nest não traz exceção para 429. O corpo é montado à mão para seguir o
    // formato de erro do projeto; sem isso o campo `error` sairia como
    // "HttpException" em vez de "Too Many Requests".
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Muitas tentativas de cadastro para este e-mail. Aguarde antes de tentar novamente.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private buildPayload(dto: CreateCircuitSignupDto, passwordHash: string, circuitName: string): CircuitSignupPayload {
    return {
      terms:
        dto.termsVersion === undefined
          ? undefined
          : { version: dto.termsVersion, acceptedAt: new Date().toISOString() },
      coordinator: {
        name: dto.coordinator.name,
        email: dto.coordinator.email,
        phone: dto.coordinator.phone,
        passwordHash,
      },
      circuit: {
        name: circuitName,
        city: dto.circuit.city,
        state: dto.circuit.state,
      },
      congregations: dto.congregations.map((congregation) => ({
        code: congregation.code,
        name: congregation.name,
      })),
    };
  }

  private resolveCircuitName(dto: CreateCircuitSignupDto): string {
    return dto.circuit.code ?? dto.circuit.name;
  }

  private circuitConflictField(dto: CreateCircuitSignupDto): 'circuit.code' | 'circuit.name' {
    return dto.circuit.code === undefined ? 'circuit.name' : 'circuit.code';
  }

  private async deliver(to: string, name: string, code: string, circuitName: string): Promise<void> {
    try {
      await this.emailSender.send(buildCircuitSignupEmail(to, name, code, circuitName));
      this.logger.log(`E-mail de confirmação de autocadastro enviado — circuitName=${circuitName}`);
    } catch (err: unknown) {
      // A falha fica registrada aqui e não muda a resposta já devolvida: o
      // rascunho existe, e o usuário pode pedir o reenvio na própria tela.
      this.logger.error({ err, circuitName }, 'Falha ao enviar e-mail de confirmação de autocadastro');
    }
  }

  /** Seis dígitos de um gerador criptográfico, com os zeros à esquerda mantidos. */
  private generateCode(): string {
    const ceiling = 10 ** CIRCUIT_SIGNUP.CODE_LENGTH;

    return crypto.randomInt(0, ceiling).toString().padStart(CIRCUIT_SIGNUP.CODE_LENGTH, '0');
  }

  /**
   * O e-mail entra no hash junto com o código. Só o código daria 10^6 hashes
   * pré-computáveis — uma tabela que caberia num pen drive; com o e-mail no
   * meio, a tabela teria de ser refeita para cada endereço.
   */
  private hashCode(email: string, code: string): string {
    return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
  }

  private codeMatches(storedHash: string, email: string, code: string): boolean {
    const candidate = this.hashCode(email, code);

    // Comparação de tempo constante. Os dois lados são hashes hexadecimais de
    // tamanho fixo, então `timingSafeEqual` nunca recebe buffers de tamanhos
    // diferentes aqui.
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(storedHash, 'hex'));
  }
}
