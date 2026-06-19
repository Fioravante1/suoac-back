export interface PaymentReceiptPdfData {
  /** Data de emissão do recibo (formatada em BRT no PDF). */
  date: Date;
  /** Rótulo do tipo de evento (ex.: "Congresso", "Assembleia"). */
  eventTypeLabel: string;
  /** Nome/título do evento. */
  eventTitle: string;
  /** Nome da congregação que efetuou o pagamento. */
  congregationName: string;
  /** Total recebido da congregação no evento, como string "NN.NN" (ver formatMoney). */
  totalReceived: string;
  /** Nome do irmão que preencheu (usuário que gerou o recibo) → "(Preenchido por)". */
  filledByName: string;
  /** Nome do coordenador do circuito → "(Conferido por)". Pode ser nulo se não houver. */
  coordinatorName: string | null;
}
