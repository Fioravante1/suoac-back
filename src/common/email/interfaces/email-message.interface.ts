/** Mensagem pronta para envio, agnóstica de provedor. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
