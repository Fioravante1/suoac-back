import { Test } from '@nestjs/testing';
import type { AuthResponse } from '../auth/interfaces/auth-response.interface';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import type { InvitationContextResponse } from './interfaces/invitation-context-response.interface';

const TOKEN = 'a'.repeat(64);

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let serviceMock: jest.Mocked<Pick<InvitationsService, 'findByToken' | 'accept'>>;

  beforeEach(async () => {
    serviceMock = { findByToken: jest.fn(), accept: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [InvitationsController],
      providers: [{ provide: InvitationsService, useValue: serviceMock }],
    }).compile();

    controller = module.get(InvitationsController);
  });

  it('deve delegar a consulta do convite ao service', async () => {
    const context = { name: 'Maria Souza' } as InvitationContextResponse;
    serviceMock.findByToken.mockResolvedValue(context);

    const result = await controller.findByToken(TOKEN);

    expect(serviceMock.findByToken).toHaveBeenCalledWith(TOKEN);
    expect(result).toBe(context);
  });

  it('deve delegar o aceite ao service e devolver a sessão', async () => {
    const session = { accessToken: 'access', refreshToken: 'refresh' } as AuthResponse;
    serviceMock.accept.mockResolvedValue(session);

    const result = await controller.accept(TOKEN, { password: 'Senha123' });

    expect(serviceMock.accept).toHaveBeenCalledWith(TOKEN, { password: 'Senha123' });
    expect(result).toBe(session);
  });
});
