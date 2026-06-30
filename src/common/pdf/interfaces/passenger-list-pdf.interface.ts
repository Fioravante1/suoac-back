/**
 * Estruturas de dados para geração do PDF de lista de passageiros inscritos.
 * Construídas no EventPassengersService e consumidas pelo PdfService.
 */

/**
 * Variante (público-alvo) da listagem:
 * - `carrier`  — lista que vai para a **empresa de ônibus** (Nome, RG, Observação).
 *   Contém RG → restrita a roles de circuito.
 * - `boarding` — lista de conferência do **capitão de ônibus** da congregação no
 *   embarque (Nome, Telefone, Observação). Sem RG → disponível a todos os roles.
 */
export type PassengerListVariant = 'carrier' | 'boarding';

export interface PassengerPdfRow {
  index: number;
  name: string;
  rg: string | null; // preenchido apenas na variante `carrier`
  phone: string | null; // preenchido apenas na variante `boarding`
  observations: string | null; // EventPassenger.observations (observação da inscrição)
}

export interface CongregationPdfBlock {
  congregationName: string;
  congregationCode: string;
  circuitName: string;
  passengers: PassengerPdfRow[];
}

/**
 * Bloco de um dia do evento, contendo as congregações com inscritos naquele dia.
 * Em eventos de dia único, há apenas um bloco e o cabeçalho do dia não é renderizado.
 */
export interface DayPdfBlock {
  dayNumber: number;
  label: string;
  date: Date;
  congregations: CongregationPdfBlock[];
}

export interface PassengerListPdfData {
  eventTitle: string;
  eventVenue: string;
  eventCity: string;
  eventState: string;
  circuitName: string;
  generatedAt: Date;
  generatedByName: string; // nome do usuário — marca d'água LGPD
  variant: PassengerListVariant;
  /** `true` em eventos multi-dia (congresso): renderiza cabeçalho por dia. */
  multiDay: boolean;
  /** Sempre ao menos um bloco. Multi-dia → um por dia com inscritos; dia único → um bloco. */
  days: DayPdfBlock[];
}

export interface ExportPdfResult {
  buffer: Buffer;
  congregationCode?: string; // presente quando filtrado por uma congregação
}
