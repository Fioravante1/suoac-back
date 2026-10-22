import { Injectable, Logger } from '@nestjs/common';
import { EmailSender } from './email-sender';
import type { EmailMessage } from './interfaces/email-message.interface';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * O envio roda fora do request (fire-and-forget), então uma conexão que o
 * provedor aceita e deixa pendurada não tem ninguém esperando por ela: sem
 * timeout, a promise ficaria presa até o limite padrão do undici (300s) e a
 * falha só apareceria no log muito depois.
 */
const REQUEST_TIMEOUT_MS = 10_000;

interface ResendErrorBody {
  message?: string;
  name?: string;
}

interface ResendSuccessBody {
  id?: string;
}

/**
 * Só o que o adaptador precisa para ler configuração. Depender desta forma, e
 * não do `ConfigService` concreto, deixa o adaptador utilizável fora do Nest —
 * é o que permite ao `scripts/send-test-email.ts` reaproveitá-lo sem subir a
 * aplicação. O `ConfigService` satisfaz esta interface.
 */
export interface EmailConfigReader {
  get(key: string): string | undefined;
}

/**
 * Envio via API HTTP do Resend.
 *
 * Usa `fetch` nativo do Node em vez do SDK: a chamada é um único POST com JSON,
 * e evitar a dependência mantém a superfície de atualização do projeto menor.
 */
@Injectable()
export class ResendEmailSender extends EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: EmailConfigReader) {
    super();

    const apiKey = config.get('RESEND_API_KEY');
    const from = config.get('EMAIL_FROM');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    if (!from) {
      throw new Error('EMAIL_FROM environment variable is not set');
    }

    this.apiKey = apiKey;
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await this.readErrorDetail(response);
      this.logger.error(`Falha ao enviar e-mail — status=${response.status} detail="${detail}"`);
      throw new Error(`Resend respondeu ${response.status}: ${detail}`);
    }

    // O id devolvido pelo Resend é o que permite rastrear a entrega no painel
    // quando alguém disser que não recebeu o e-mail. O destinatário não é
    // logado: é o próprio dado que o fluxo evita revelar.
    const messageId = await this.readMessageId(response);
    this.logger.log(`E-mail aceito pelo provedor — messageId=${messageId}`);
  }

  private async readMessageId(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as ResendSuccessBody;
      return body.id ?? 'desconhecido';
    } catch {
      return 'desconhecido';
    }
  }

  private async readErrorDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as ResendErrorBody;
      return body.message ?? body.name ?? 'sem detalhe';
    } catch {
      return 'corpo ilegível';
    }
  }
}
