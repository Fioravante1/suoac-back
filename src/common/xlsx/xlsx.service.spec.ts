import type {
  FinancialSummaryExportData,
  PaymentsExtractExportData,
} from '../export/financial-export.interface';
import { XlsxService } from './xlsx.service';

const GENERATED_AT = new Date('2026-06-29T15:00:00Z');

const summaryData = (overrides: Partial<FinancialSummaryExportData> = {}): FinancialSummaryExportData => ({
  eventTitle: 'Congresso Regional 2026',
  generatedAt: GENERATED_AT,
  generatedByName: 'João Coordenador',
  totals: {
    totalPassengers: 3,
    totalExpected: '150.00',
    totalReceived: '90.00',
    totalPending: '60.00',
    byStatus: { paid: 1, partial: 1, pending: 1, exempt: 0 },
  },
  congregations: [
    {
      congregationName: 'Congregação Central',
      totalPassengers: 2,
      totalExpected: '100.00',
      totalReceived: '60.00',
      totalPending: '40.00',
      byStatus: { paid: 1, partial: 1, pending: 0, exempt: 0 },
    },
  ],
  ...overrides,
});

const extractData = (overrides: Partial<PaymentsExtractExportData> = {}): PaymentsExtractExportData => ({
  eventTitle: 'Congresso Regional 2026',
  generatedAt: GENERATED_AT,
  generatedByName: 'João Coordenador',
  congregationName: 'Congregação Central',
  rows: [
    { paidAt: new Date('2026-06-20T10:00:00Z'), passengerName: 'Maria', congregationName: 'Central', amount: '50.00', observations: 'parcela 1' },
    { paidAt: new Date('2026-06-21T10:00:00Z'), passengerName: 'José', congregationName: 'Central', amount: '40.00', observations: null },
  ],
  totalReceived: '90.00',
  ...overrides,
});

/** Assinatura de um arquivo XLSX (container ZIP): bytes `PK\x03\x04`. */
const isXlsxBuffer = (buffer: Buffer): boolean => buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;

describe('XlsxService', () => {
  let service: XlsxService;

  beforeEach(() => {
    service = new XlsxService();
  });

  describe('generateFinancialSummary', () => {
    it('deve gerar um buffer XLSX válido (assinatura ZIP PK)', async () => {
      const buffer = await service.generateFinancialSummary(summaryData());

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(isXlsxBuffer(buffer)).toBe(true);
    });

    it('deve gerar XLSX mesmo sem congregações (estado vazio)', async () => {
      const buffer = await service.generateFinancialSummary(summaryData({ congregations: [] }));

      expect(isXlsxBuffer(buffer)).toBe(true);
    });
  });

  describe('generatePaymentsExtract', () => {
    it('deve gerar um buffer XLSX válido com linhas de pagamento', async () => {
      const buffer = await service.generatePaymentsExtract(extractData());

      expect(isXlsxBuffer(buffer)).toBe(true);
    });

    it('deve gerar XLSX sem linha de congregação quando não filtrado', async () => {
      const buffer = await service.generatePaymentsExtract(extractData({ congregationName: null }));

      expect(isXlsxBuffer(buffer)).toBe(true);
    });

    it('deve gerar XLSX mesmo sem pagamentos (estado vazio)', async () => {
      const buffer = await service.generatePaymentsExtract(extractData({ rows: [], totalReceived: '0.00' }));

      expect(isXlsxBuffer(buffer)).toBe(true);
    });
  });
});
