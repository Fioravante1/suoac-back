import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthResponse } from '../auth/interfaces/auth-response.interface';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { DeclineInvitationDto } from './dto/decline-invitation.dto';
import type { InvitationContextResponse } from './interfaces/invitation-context-response.interface';
import { InvitationsService } from './invitations.service';

/**
 * Só consulta, aceite e recusa são expostos. Criação, reenvio e revogação
 * vivem no service e ganham rota na Fatia 6, protegidas por autorização por
 * circuito.
 *
 * Os três endpoints são públicos: quem os chama ainda não tem conta. Cada
 * estado em que o convite não pode ser aceito nem recusado responde com status
 * e `code` próprios — `404` `INVITATION_NOT_FOUND`, `410` `INVITATION_EXPIRED`,
 * `409` `INVITATION_USED`, `409` `INVITATION_DECLINED`, `403`
 * `INVITATION_REVOKED` — e o aceite acrescenta `409`
 * `INVITATION_EMAIL_ALREADY_REGISTERED`.
 */
@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Public()
  @Get(':token')
  async findByToken(@Param('token') token: string): Promise<InvitationContextResponse> {
    return this.invitationsService.findByToken(token);
  }

  @Public()
  @Post(':token/acceptances')
  @HttpCode(HttpStatus.CREATED)
  async accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto): Promise<AuthResponse> {
    return this.invitationsService.accept(token, dto);
  }

  @Public()
  @Post(':token/declines')
  @HttpCode(HttpStatus.NO_CONTENT)
  async decline(@Param('token') token: string, @Body() dto: DeclineInvitationDto): Promise<void> {
    await this.invitationsService.decline(token, dto);
  }
}
