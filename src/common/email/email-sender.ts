import type { EmailMessage } from './interfaces/email-message.interface';

/**
 * Fronteira de envio de e-mail.
 *
 * Classe abstrata, e não interface, para servir de token de injeção do Nest
 * (interface não sobrevive à compilação). Quem consome depende desta abstração;
 * qual provedor está por trás é decisão do `EmailModule`.
 */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}
