import type { EmailMessage } from './interfaces/email-message.interface';
import { type EmailConfigReader, ResendEmailSender } from './resend-email-sender';

// ── Helpers ──────────────────────────────────────────────────────
function buildConfig(overrides: { apiKey?: string | undefined; from?: string | undefined } = {}): EmailConfigReader {
  const values: Record<string, string | undefined> = {
    RESEND_API_KEY: 'apiKey' in overrides ? overrides.apiKey : 're_fake_key',
    EMAIL_FROM: 'from' in overrides ? overrides.from : 'SUOAC <nao-responda@suoac.example.com>',
  };

  return { get: (key: string) => values[key] };
}

function buildMessage(): EmailMessage {
  return {
    to: 'joao@example.com',
    subject: 'Recuperação de senha — SUOAC',
    html: '<p>link</p>',
    text: 'link',
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('ResendEmailSender', () => {
  let fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('construcao', () => {
    it('deve falhar quando RESEND_API_KEY esta ausente', () => {
      expect(() => new ResendEmailSender(buildConfig({ apiKey: undefined }))).toThrow(
        'RESEND_API_KEY environment variable is not set',
      );
    });

    it('deve falhar quando EMAIL_FROM esta ausente', () => {
      expect(() => new ResendEmailSender(buildConfig({ from: undefined }))).toThrow(
        'EMAIL_FROM environment variable is not set',
      );
    });
  });

  describe('send', () => {
    it('deve enviar remetente, destinatario e corpos para a API do Resend', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
      const sender = new ResendEmailSender(buildConfig());

      await sender.send(buildMessage());

      const init = fetchMock.mock.calls[0]?.[1];
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, string>;

      expect(body).toEqual({
        from: 'SUOAC <nao-responda@suoac.example.com>',
        to: 'joao@example.com',
        subject: 'Recuperação de senha — SUOAC',
        html: '<p>link</p>',
        text: 'link',
      });
    });

    it('deve autenticar com a chave da API', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
      const sender = new ResendEmailSender(buildConfig());

      await sender.send(buildMessage());

      const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;

      expect(headers.Authorization).toBe('Bearer re_fake_key');
    });

    it('deve abortar a requisicao se o provedor nao responder', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
      const sender = new ResendEmailSender(buildConfig());

      await sender.send(buildMessage());

      // Sem isso, o envio fora do request ficaria pendurado até o limite padrão
      // do undici e a falha apareceria no log minutos depois.
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it('nao deve falhar quando a resposta de sucesso nao traz id', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 200 }));
      const sender = new ResendEmailSender(buildConfig());

      await expect(sender.send(buildMessage())).resolves.toBeUndefined();
    });

    it('deve lancar erro com o detalhe devolvido pelo provedor', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'domain not verified' }), { status: 422 }));
      const sender = new ResendEmailSender(buildConfig());

      await expect(sender.send(buildMessage())).rejects.toThrow('Resend respondeu 422: domain not verified');
    });

    it('deve lancar erro mesmo quando o corpo do erro nao e legivel', async () => {
      fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
      const sender = new ResendEmailSender(buildConfig());

      await expect(sender.send(buildMessage())).rejects.toThrow('Resend respondeu 502');
    });
  });
});
