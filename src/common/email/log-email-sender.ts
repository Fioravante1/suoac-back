import { Injectable, Logger } from '@nestjs/common';
import { EmailSender } from './email-sender';
import type { EmailMessage } from './interfaces/email-message.interface';

/**
 * Sender de desenvolvimento: registra a mensagem no log em vez de enviar.
 *
 * O corpo em texto puro vai para o log de propósito — é dele que se extrai o
 * link de recuperação para testar o fluxo localmente, sem provedor configurado.
 */
@Injectable()
export class LogEmailSender extends EmailSender {
  private readonly logger = new Logger(LogEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `E-mail não enviado (ambiente de desenvolvimento) — to="${message.to}" subject="${message.subject}"`,
    );
    this.logger.debug(message.text);
    return Promise.resolve();
  }
}
