import { IsEnum } from 'class-validator';
import { InvitationDeclineReason } from '../../generated/prisma/enums';

/**
 * O convidado só escolhe um dos motivos do desenho, que são os do enum do
 * schema. Sem texto livre: a rota é pública e o motivo vai por e-mail para o
 * circuito.
 */
export class DeclineInvitationDto {
  @IsEnum(InvitationDeclineReason)
  reason!: InvitationDeclineReason;
}
