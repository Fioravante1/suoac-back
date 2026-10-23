import * as crypto from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthService } from '../auth/auth.service';
import type { AuthResponse } from '../auth/interfaces/auth-response.interface';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { EmailSender } from '../common/email/email-sender';
import { HashingService } from '../common/hashing/hashing.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { buildInvitationEmail } from './invitation-email.template';
import {
  exceptionForState,
  invitationEmailAlreadyRegistered,
  invitationExpired,
  invitationNotFound,
} from './invitation-errors';
import { INVITABLE_ROLES, INVITATION } from './invitations.constants';
import type { CreateInvitationInput } from './interfaces/create-invitation-input.interface';
import type { InvitationContextResponse } from './interfaces/invitation-context-response.interface';
import type { InvitationResponse, IssuedInvitationResponse } from './interfaces/invitation-response.interface';
import type { InvitationState } from './interfaces/invitation-state.type';

interface InvitationRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  congregationId: string;
  circuitId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

interface InvitationWithContext extends InvitationRow {
  circuit: { name: string; city: string; state: string };
  congregation: { name: string; code: string };
  createdBy: { name: string };
}

/** Nomes que o convite carrega para a tela de aceite e para o e-mail. */
const CONTEXT_INCLUDE = {
  circuit: { select: { name: true, city: true, state: true } },
  congregation: { select: { name: true, code: true } },
  createdBy: { select: { name: true } },
} as const;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    private readonly emailSender: EmailSender,
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    const frontendUrl = config.get<string>('FRONTEND_URL');

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL environment variable is not set');
    }

    this.frontendUrl = frontendUrl.replace(/\/+$/, '');
  }

  /**
   * Contexto que a tela de aceite mostra antes de pedir dados. Público: quem
   * tem o token é, por construção, o convidado, mas a resposta continua sendo o
   * mínimo necessário.
   */
  async findByToken(token: string): Promise<InvitationContextResponse> {
    const invitation = await this.loadByToken(token);

    this.assertPending(invitation);

    return {
      name: invitation.name,
      email: invitation.email,
      phone: invitation.phone,
      role: invitation.role,
      invitedBy: invitation.createdBy.name,
      circuit: invitation.circuit.name,
      circuitCity: invitation.circuit.city,
      circuitState: invitation.circuit.state,
      congregation: invitation.congregation.name,
      congregationCode: invitation.congregation.code,
      congregationCoordinator: await this.findCongregationCoordinator(invitation),
      expiresAt: invitation.expiresAt,
    };
  }

  /** Só o assistente é apresentado a um coordenador; o coordenador convidado não auxilia ninguém. */
  private async findCongregationCoordinator(invitation: InvitationRow): Promise<string | null> {
    if (invitation.role !== 'CONGREGATION_ASSISTANT') {
      return null;
    }

    const coordinator = await this.prisma.client.user.findFirst({
      where: { congregationId: invitation.congregationId, role: 'CONGREGATION_COORDINATOR', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    });

    return coordinator?.name ?? null;
  }

  /**
   * Cria o usuário com a senha definida, ligado à congregação e ao papel do
   * convite, consome o token e devolve a sessão.
   *
   * Nome e celular vêm do próprio convidado, que os confirmou na tela; e-mail,
   * papel e congregação são os do convite.
   *
   * O usuário nasce com `mustChangePassword: false`: ele acabou de escolher a
   * senha, e mandá-lo ao fluxo de primeiro acesso o faria trocá-la logo em
   * seguida.
   */
  async accept(token: string, dto: AcceptInvitationDto): Promise<AuthResponse> {
    const invitation = await this.loadByToken(token);

    this.assertPending(invitation);
    await this.assertEmailAvailable(invitation.email);

    const passwordHash = await this.hashingService.hash(dto.password);
    const user = await this.consume(invitation, dto, passwordHash);
    const session = await this.authService.issueSession(user);

    this.logger.log(`Convite aceito — invitationId=${invitation.id} userId=${user.id}`);

    void this.auditLogService
      .log('CREATE', 'User', user.id, user.id, {
        oldValues: null,
        newValues: { invitationId: invitation.id, role: user.role, congregationId: user.congregationId },
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: user.id }, 'Falha ao gravar audit log'));

    return session;
  }

  /**
   * Cria o convite e envia o link por e-mail. Ainda não exposto por endpoint:
   * entra na Fatia 6, quando o cadastro de congregação passa a convidar.
   */
  async create(input: CreateInvitationInput, user: JwtPayload): Promise<IssuedInvitationResponse> {
    this.assertCanInvite(user);

    // `InvitableRole` só vale em compilação; quem chamar sem passar pelo tipo
    // (um controller futuro sem validação) não pode conceder papel de circuito.
    if (!INVITABLE_ROLES.includes(input.role)) {
      throw new UnprocessableEntityException('Este papel não pode ser concedido por convite');
    }

    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id: input.congregationId },
      select: { id: true, name: true, circuitId: true },
    });

    if (!congregation) {
      throw new NotFoundException('Congregação não encontrada');
    }

    checkCircuitOwnership(user, congregation.circuitId);

    const email = this.normalizeEmail(input.email);

    // Falha cedo: um convite para quem já tem conta nunca poderia ser aceito.
    await this.assertEmailAvailable(email);

    const token = this.generateToken();
    const invitation = await this.prisma.client.invitation.create({
      data: {
        name: input.name,
        email,
        phone: this.normalizePhone(input.phone),
        role: input.role,
        tokenHash: this.hashToken(token),
        expiresAt: this.newExpiration(),
        circuitId: congregation.circuitId,
        congregationId: congregation.id,
        createdById: user.sub,
      },
      include: { createdBy: { select: { name: true } } },
    });

    this.logger.log(`Convite criado — invitationId=${invitation.id} congregationId=${congregation.id}`);

    return this.deliver(invitation, token, invitation.createdBy.name, congregation.name);
  }

  /**
   * Gera um token novo e renova o prazo. Serve a convite pendente ou expirado;
   * o link antigo deixa de valer, porque só o hash do novo fica no banco.
   */
  async resend(id: string, user: JwtPayload): Promise<IssuedInvitationResponse> {
    const invitation = await this.loadOwned(id, user);
    const state = this.resolveState(invitation);

    if (state === 'USED' || state === 'REVOKED') {
      throw exceptionForState(state);
    }

    // A pessoa pode ter criado conta por conta própria desde o convite; reenviar
    // mandaria um link que só leva ao `409` do aceite.
    await this.assertEmailAvailable(invitation.email);

    const token = this.generateToken();
    const updated = await this.updateWhilePending(id, {
      tokenHash: this.hashToken(token),
      expiresAt: this.newExpiration(),
    });

    this.logger.log(`Convite reenviado — invitationId=${id}`);

    return this.deliver(updated, token, invitation.createdBy.name, invitation.congregation.name);
  }

  /** Cancela o convite. Repetir a chamada num convite já revogado não muda nada. */
  async revoke(id: string, user: JwtPayload): Promise<InvitationResponse> {
    const invitation = await this.loadOwned(id, user);
    const state = this.resolveState(invitation);

    if (state === 'USED') {
      throw exceptionForState(state);
    }

    if (state === 'REVOKED') {
      return this.toResponse(invitation);
    }

    const revoked = await this.updateWhilePending(id, { revokedAt: new Date() });

    this.logger.log(`Convite revogado — invitationId=${id}`);

    return this.toResponse(revoked);
  }

  /**
   * Marca o convite como usado e cria o usuário na mesma transação, então duplo
   * clique não cria duas contas: a segunda chamada não encontra mais convite
   * pendente para consumir.
   */
  private async consume(
    invitation: InvitationWithContext,
    profile: Pick<AcceptInvitationDto, 'name' | 'phone'>,
    passwordHash: string,
  ): Promise<SessionUserRow> {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const claimed = await tx.invitation.updateMany({
          where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });

        // Perdeu a corrida: o convite foi aceito, revogado ou expirou entre a
        // leitura e este ponto. Relê para responder com o estado verdadeiro.
        if (claimed.count !== 1) {
          const current = await tx.invitation.findUniqueOrThrow({
            where: { id: invitation.id },
            include: CONTEXT_INCLUDE,
          });
          this.assertPending(current);
          throw new ConflictException('Não foi possível aceitar o convite. Tente novamente.');
        }

        return tx.user.create({
          data: {
            name: profile.name,
            email: invitation.email,
            phone: profile.phone,
            passwordHash,
            role: invitation.role as SessionUserRow['role'],
            circuitId: invitation.circuitId,
            congregationId: invitation.congregationId,
            mustChangePassword: false,
          },
        });
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Alguém criou a conta com este e-mail depois da checagem acima.
        throw invitationEmailAlreadyRegistered();
      }

      throw err;
    }
  }

  private async loadByToken(token: string): Promise<InvitationWithContext> {
    const invitation = await this.findWithContext({ tokenHash: this.hashToken(token) });

    if (!invitation) {
      throw invitationNotFound();
    }

    return invitation;
  }

  /** Carrega por id e só entrega ao coordenador do circuito dono do convite. */
  private async loadOwned(id: string, user: JwtPayload): Promise<InvitationWithContext> {
    this.assertCanInvite(user);

    const invitation = await this.findWithContext({ id });

    if (!invitation) {
      throw invitationNotFound();
    }

    checkCircuitOwnership(user, invitation.circuitId);

    return invitation;
  }

  private findWithContext(where: Prisma.InvitationWhereUniqueInput): Promise<InvitationWithContext | null> {
    return this.prisma.client.invitation.findUnique({ where, include: CONTEXT_INCLUDE });
  }

  /**
   * Escreve só se o convite ainda não foi usado nem revogado. O estado lido
   * antes pode ter mudado — um aceite concorrente, por exemplo —, e uma escrita
   * incondicional reviveria ou revogaria um convite já consumido. Quando perde
   * a corrida, responde com o estado verdadeiro.
   */
  private async updateWhilePending(id: string, data: Prisma.InvitationUpdateInput): Promise<InvitationRow> {
    try {
      return await this.prisma.client.invitation.update({ where: { id, usedAt: null, revokedAt: null }, data });
    } catch (err: unknown) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
        throw err;
      }

      return this.failLostRace(id);
    }
  }

  private async failLostRace(id: string): Promise<never> {
    const current = await this.findWithContext({ id });

    if (!current) {
      throw invitationNotFound();
    }

    const state = this.resolveState(current);

    if (state === 'USED' || state === 'REVOKED') {
      throw exceptionForState(state);
    }

    throw new ConflictException('Não foi possível concluir a operação. Tente novamente.');
  }

  /** Convidar é atribuição do circuito; coordenador de congregação não convida. */
  private assertCanInvite(user: JwtPayload): void {
    if (isCircuitRole(user.role)) {
      return;
    }

    throw new ForbiddenException('Apenas o circuito pode convidar coordenadores de congregação');
  }

  private assertPending(invitation: InvitationWithContext): void {
    const state = this.resolveState(invitation);

    if (state === 'PENDING') {
      return;
    }

    this.logger.warn(`Convite não aceitável — invitationId=${invitation.id} state=${state}`);

    if (state === 'EXPIRED') {
      throw invitationExpired({
        email: invitation.email,
        invitedBy: invitation.createdBy.name,
        sentAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      });
    }

    throw exceptionForState(state);
  }

  /** Usado vence revogado, que vence expirado: é a ordem do que aconteceu de mais definitivo. */
  private resolveState(invitation: InvitationRow): InvitationState {
    if (invitation.usedAt) {
      return 'USED';
    }

    if (invitation.revokedAt) {
      return 'REVOKED';
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      return 'EXPIRED';
    }

    return 'PENDING';
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.client.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (!existing) {
      return;
    }

    this.logger.warn(`Convite para e-mail com conta existente — userId=${existing.id}`);
    throw invitationEmailAlreadyRegistered();
  }

  /** Monta a resposta com o link e dispara o e-mail fora do request. */
  private deliver(
    invitation: InvitationRow,
    token: string,
    inviterName: string,
    congregationName: string,
  ): IssuedInvitationResponse {
    const link = `${this.frontendUrl}/accept-invitation?token=${token}`;

    void this.sendEmail(invitation, inviterName, congregationName, link);

    return { ...this.toResponse(invitation), link };
  }

  private async sendEmail(
    invitation: InvitationRow,
    inviterName: string,
    congregationName: string,
    link: string,
  ): Promise<void> {
    try {
      await this.emailSender.send(
        buildInvitationEmail(invitation.email, invitation.name, inviterName, congregationName, link),
      );
      this.logger.log(`E-mail de convite enviado — invitationId=${invitation.id}`);
    } catch (err: unknown) {
      // O link também volta na resposta, então o coordenador ainda pode
      // repassá-lo por outro canal; a falha fica só no log.
      this.logger.error({ err, invitationId: invitation.id }, 'Falha ao enviar e-mail de convite');
    }
  }

  private toResponse(invitation: InvitationRow): InvitationResponse {
    return {
      id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      phone: invitation.phone,
      role: invitation.role,
      congregationId: invitation.congregationId,
      state: this.resolveState(invitation),
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  private newExpiration(): Date {
    return new Date(Date.now() + INVITATION.TOKEN_TTL_MS);
  }

  private generateToken(): string {
    return crypto.randomBytes(INVITATION.TOKEN_BYTES).toString('hex');
  }

  /** Só dígitos, como o `User.phone`; vazio vira `null`. A máscara é apresentação. */
  private normalizePhone(phone: string | null | undefined): string | null {
    const digits = phone?.replace(/\D/g, '') ?? '';

    return digits === '' ? null : digits;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

/** Linha de usuário devolvida pela criação, no formato que `issueSession` consome. */
type SessionUserRow = Awaited<ReturnType<PrismaService['client']['user']['create']>>;
