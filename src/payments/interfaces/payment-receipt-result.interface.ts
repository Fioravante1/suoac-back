export interface PaymentReceiptResult {
  /** Conteúdo binário do PDF do recibo. */
  buffer: Buffer;
  /** Código da congregação, usado para compor o nome do arquivo. */
  congregationCode: string;
}
