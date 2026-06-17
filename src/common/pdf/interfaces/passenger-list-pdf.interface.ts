/**
 * Estruturas de dados para geração do PDF de lista de passageiros inscritos.
 * Construídas no EventPassengersService e consumidas pelo PdfService.
 */

export interface PassengerPdfRow {
  index: number;
  name: string;
  rg: string | null; // null quando includeSensitive=false
  phone: string | null;
  observations: string | null; // EventPassenger.observations (observação da inscrição)
}

export interface CongregationPdfBlock {
  congregationName: string;
  congregationCode: string;
  circuitName: string;
  passengers: PassengerPdfRow[];
}

export interface PassengerListPdfData {
  eventTitle: string;
  eventVenue: string;
  eventCity: string;
  eventState: string;
  circuitName: string;
  generatedAt: Date;
  generatedByName: string; // nome do usuário — marca d'água LGPD
  includeSensitive: boolean;
  congregations: CongregationPdfBlock[];
}

export interface ExportPdfResult {
  buffer: Buffer;
  congregationCode?: string; // presente quando filtrado por uma congregação
}
