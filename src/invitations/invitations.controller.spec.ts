import { Test } from '@nestjs/testing';
import type { AuthResponse } from '../auth/interfaces/auth-response.interface';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import type { InvitationContextResponse } from './interfaces/invitation-context-response.interface';

const TOKEN = 'a'.repeat(64);

describe('InvitationsController', () => {
  let controller: InvitationsController;
  let serviceMock: jest.Mocked<Pick<InvitationsService, 'findByToken' | 'accept' | 'decline' | 'requestRenewal'>>;

  beforeEach(async () => {
    serviceMock = { findByToken: jest.fn(), accept: jest.fn(), decline: jest.fn(), requestRenewal: jest.fn() };

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

    const dto = { name: 'Maria Souza', phone: '11987654321', password: 'Senha123' };

    const result = await controller.accept(TOKEN, dto);

    expect(serviceMock.accept).toHaveBeenCalledWith(TOKEN, dto);
    expect(result).toBe(session);
  });

  it('deve delegar a recusa ao service sem devolver corpo', async () => {
    serviceMock.decline.mockResolvedValue(undefined);

    const dto = { reason: 'NOT_THE_PERSON' } as const;

    const result = await controller.decline(TOKEN, dto);

    expect(serviceMock.decline).toHaveBeenCalledWith(TOKEN, dto);
    expect(result).toBeUndefined();
  });

  it('deve delegar o pedido de novo convite ao service sem devolver corpo', async () => {
    serviceMock.requestRenewal.mockResolvedValue(undefined);

    const result = await controller.requestRenewal(TOKEN);

    expect(serviceMock.requestRenewal).toHaveBeenCalledWith(TOKEN);
    expect(result).toBeUndefined();
  });
});
