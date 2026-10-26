import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailSender } from '../common/email/email-sender';
import { normalizeEmail } from '../common/validators/email.transform';
import { HashingService } from '../common/hashing/hashing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PasswordResetVerificationDto } from './dto/password-reset-verification.dto';
import type { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { buildPasswordResetEmail } from './password-reset-email.template';
import { PASSWORD_RESET } from './password-reset.constants';

interface UsableRequest {
  id: string;
  userId: string | null;
}

/** Client dentro de uma transação interativa do Prisma. */
type PrismaTransaction = Parameters<Parameters<PrismaService['client']['$transaction']>[0]>[0];

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly frontendUrl: string;
  private readonly maxRequestsPerWindow: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    private readonly emailSender: EmailSender,
    private readonly auditLogService: AuditLogService,
    config: ConfigService,
  ) {
    const frontendUrl = config.get<string>('FRONTEND_URL');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL environment variable is not set');
    }

    this.frontendUrl = frontendUrl.replace(/\/+$/, '');

    const configuredMax = parseInt(config.get<string>('PASSWORD_RESET_MAX_PER_HOUR') ?? '', 10);
    this.maxRequestsPerWindow =
      Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : PASSWORD_RESET.RATE_LIMIT_DEFAULT_MAX;
  }

  /**
   * Registra a solicitação e, quando o e-mail pertence a uma conta ativa, envia
   * o link de recuperação.
   *
   * Status e corpo são idênticos para conta existente e inexistente, e a
   * tentativa é registrada nos dois casos — se só os e-mails conhecidos fossem
   * contados, o `429` viraria um detector de contas.
   *
   * O tempo de resposta **não** é constante, e isso é uma limitação conhecida:
   * tirar o envio do request eliminou a diferença grande, mas o caminho de conta
   * existente ainda faz mais trabalho de banco (busca do usuário, que não usa
   * índice por ser case-insensitive, mais a inserção do token). Amostragem de
   * latência ainda consegue separar um caso do outro. Equalizar de verdade passa
   * por normalizar `User.email` e indexar a busca — card próprio.
   */
  async requestReset(dto: RequestPasswordResetDto): Promise<void> {
    const email = normalizeEmail(dto.email);

    // Contagem e inserção na mesma transação, serializadas por e-mail com um
    // advisory lock. Checar e depois inserir em chamadas separadas deixava o
    // limite passável: requisições concorrentes leriam todas a mesma contagem
    // antiga, todas passariam, e sairiam N e-mails para a mesma pessoa. Como
    // este contador é a única defesa do fluxo (não há limite por IP aqui, ver
    // SUC-47), ele precisa ser atômico de verdade.
    const issued = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;

      await this.assertWithinRateLimit(tx, email);

      // `email` já está normalizado (minúsculas), como o banco exige, então a busca
      // por igualdade usa o índice `users_email_key`: o caminho de conta existente e o
      // de conta inexistente custam o mesmo, e não sobra diferença de tempo para medir.
      const user = await tx.user.findUnique({ where: { email } });

      if (!user || !user.isActive) {
        await tx.passwordResetRequest.create({ data: { email } });
        this.logger.debug(`Solicitação de recuperação para e-mail sem conta elegível — email="${email}"`);
        return null;
      }

      const token = crypto.randomBytes(PASSWORD_RESET.TOKEN_BYTES).toString('hex');

      // Os links anteriores continuam valendo até expirar. Invalidá-los a cada
      // pedido novo — como esta feature fazia antes — dava a quem soubesse o
      // e-mail da vítima uma forma barata de matar, à distância, o link que ela
      // já tinha na caixa de entrada. Cada token é de uso único, tem 256 bits e
      // vive 1 hora; conviver com alguns válidos ao mesmo tempo custa menos que
      // deixar a recuperação ser sabotada por terceiros.
      await tx.passwordResetRequest.create({
        data: {
          email,
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET.TOKEN_TTL_MS),
        },
      });

      return { token, email: user.email, name: user.name, userId: user.id };
    });

    if (!issued) {
      return;
    }

    this.logger.log(`Link de recuperação gerado — userId=${issued.userId}`);

    // Envio depois do commit e fora do request: aguardar o provedor faria a
    // resposta de conta existente demorar muito mais que a de conta desconhecida,
    // e o relógio reabriria a enumeração que a resposta neutra fecha.
    void this.deliver(issued.email, issued.name, issued.token, issued.userId);
  }

  /** Informa o estado do token sem consumi-lo, para a tela de redefinição. */
  async verifyToken(dto: PasswordResetVerificationDto): Promise<void> {
    await this.findUsableRequest(dto.token);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const request = await this.findUsableRequest(dto.token);

    if (!request.userId) {
      this.logger.error(`Solicitação com token e sem usuário — requestId=${request.id}`);
      throw new BadRequestException('Token de recuperacao invalido');
    }

    const userId = request.userId;

    // A conta pode ter sido desativada dentro da hora de validade do link.
    // Sem esta checagem, a senha seria reescrita e a sessão revogada numa conta
    // inativa, devolvendo `204` como se tudo tivesse dado certo — e o login
    // recusaria em seguida, sem explicação. Responde `400` como token inválido:
    // o link é, de fato, inutilizável, e quem tem o token já provou posse dele,
    // então não há o que vazar aqui.
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });

    if (!user?.isActive) {
      this.logger.warn(`Redefinição recusada — conta inexistente ou inativa userId=${userId}`);
      throw new BadRequestException('Token de recuperacao invalido');
    }

    const passwordHash = await this.hashingService.hash(dto.newPassword);

    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
      }),
      this.prisma.client.session.deleteMany({ where: { userId } }),
      this.prisma.client.passwordResetRequest.update({
        where: { id: request.id },
        data: { usedAt: new Date() },
      }),
    ]);

    this.logger.log(`Senha redefinida por link de recuperação — userId=${userId}`);

    void this.auditLogService
      .log('UPDATE', 'User', userId, userId, {
        oldValues: null,
        newValues: { passwordReset: true, sessionsRevoked: true },
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: userId }, 'Falha ao gravar audit log'));
  }

  /**
   * Remove solicitações antigas. Elas só têm valor dentro da janela do limite
   * por e-mail; depois disso são apenas e-mails guardados sem motivo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'password-reset-purge' })
  async handlePurgeCron(): Promise<void> {
    // O `@nestjs/schedule` não recebe errorHandler, então uma exceção que escape
    // daqui sai por `console.error` da lib `cron` — fora do Pino, sem contexto e
    // invisível no log estruturado. Uma falha de banco às 4h ficaria silenciosa.
    try {
      await this.purgeStaleRequests();
    } catch (err: unknown) {
      this.logger.error({ err }, 'Falha ao purgar solicitações de recuperação de senha');
    }
  }

  async purgeStaleRequests(): Promise<void> {
    const threshold = new Date(Date.now() - PASSWORD_RESET.RETENTION_MS);
    const { count } = await this.prisma.client.passwordResetRequest.deleteMany({
      where: { createdAt: { lt: threshold } },
    });

    if (count > 0) {
      this.logger.log(`Solicitações de recuperação purgadas — count=${count}`);
    }
  }

  private async assertWithinRateLimit(tx: PrismaTransaction, email: string): Promise<void> {
    const since = new Date(Date.now() - PASSWORD_RESET.RATE_LIMIT_WINDOW_MS);
    const recentRequests = await tx.passwordResetRequest.count({
      where: { email, createdAt: { gte: since } },
    });

    if (recentRequests < this.maxRequestsPerWindow) {
      return;
    }

    this.logger.warn(`Limite de solicitações de recuperação atingido — email="${email}"`);

    // O Nest não traz exceção para 429. O corpo é montado à mão para seguir o
    // formato de erro do projeto; sem isso o campo `error` sairia como
    // "HttpException" em vez de "Too Many Requests".
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Muitas solicitacoes de recuperacao. Aguarde antes de tentar novamente.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async findUsableRequest(token: string): Promise<UsableRequest> {
    const request = await this.prisma.client.passwordResetRequest.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (!request) {
      throw new BadRequestException('Token de recuperacao invalido');
    }

    if (request.usedAt) {
      this.logger.warn(`Token de recuperação já utilizado — requestId=${request.id}`);
      throw new ConflictException('Token de recuperacao ja utilizado');
    }

    if (!request.expiresAt || request.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(`Token de recuperação expirado — requestId=${request.id}`);
      throw new GoneException('Token de recuperacao expirado');
    }

    return { id: request.id, userId: request.userId };
  }

  private async deliver(to: string, name: string, token: string, userId: string): Promise<void> {
    const link = `${this.frontendUrl}/reset-password?token=${token}`;

    try {
      await this.emailSender.send(buildPasswordResetEmail(to, name, link));
      this.logger.log(`E-mail de recuperação enviado — userId=${userId}`);
    } catch (err: unknown) {
      // A falha fica registrada aqui e não muda a resposta já devolvida ao
      // cliente: dizer "não consegui enviar" revelaria que a conta existe.
      this.logger.error({ err, userId }, 'Falha ao enviar e-mail de recuperação');
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
