import { EventEmitter } from 'node:events';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './pdf.service';
import type { FinancialSummaryExportData, PaymentsExtractExportData } from '../export/financial-export.interface';
import type { FinancialReportPdfData } from './interfaces/financial-report-pdf.interface';
import type {
  CongregationPdfBlock,
  DayPdfBlock,
  PassengerListPdfData,
} from './interfaces/passenger-list-pdf.interface';
import type { PaymentReceiptPdfData } from './interfaces/payment-receipt-pdf.interface';

// Captura a última docDefinition passada ao printer e simula o stream PDFKit.
const capturedDocs: TDocumentDefinitions[] = [];

jest.mock('pdfmake', () => {
  return jest.fn().mockImplementation(() => ({
    createPdfKitDocument: (docDefinition: TDocumentDefinitions) => {
      capturedDocs.push(docDefinition);
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
      emitter.end = (): void => {
        process.nextTick(() => {
          emitter.emit('data', Buffer.from('%PDF-'));
          emitter.emit('end');
        });
      };
      return emitter;
    },
  }));
});

/**
 * Monta os dados do PDF. Aceita o atalho `congregations` (evento de dia único) ou
 * `days` (multi-dia). Por padrão, variante `boarding` (Nome/Telefone/Observação).
 */
function buildData(
  overrides: Partial<Omit<PassengerListPdfData, 'days'>> & {
    congregations?: CongregationPdfBlock[];
    days?: DayPdfBlock[];
  } = {},
): PassengerListPdfData {
  const defaultCongregations: CongregationPdfBlock[] = [
    {
      congregationName: 'Congregação Cidade Popular',
      congregationCode: '105478',
      circuitName: 'SP019',
      passengers: [
        { index: 1, name: 'Ana Maria', rg: '12.345.678-9', phone: '11999990000', observations: 'Cadeira de rodas' },
        { index: 2, name: 'Bruno Costa', rg: '98.765.432-1', phone: null, observations: null },
      ],
    },
  ];

  const days: DayPdfBlock[] = overrides.days ?? [
    {
      dayNumber: 1,
      label: 'Dia 1',
      date: new Date('2026-06-16'),
      congregations: overrides.congregations ?? defaultCongregations,
    },
  ];

  return {
    eventTitle: overrides.eventTitle ?? 'Congresso Regional 2026',
    eventVenue: overrides.eventVenue ?? 'Ginásio Municipal',
    eventCity: overrides.eventCity ?? 'São Paulo',
    eventState: overrides.eventState ?? 'SP',
    circuitName: overrides.circuitName ?? 'SP019',
    generatedAt: overrides.generatedAt ?? new Date('2026-06-16T14:32:00'),
    generatedByName: overrides.generatedByName ?? 'João Coordenador',
    variant: overrides.variant ?? 'boarding',
    multiDay: overrides.multiDay ?? false,
    days,
  };
}

// Serializa a docDefinition para busca textual de conteúdo (texto está espalhado em nós aninhados).
function serialize(doc: TDocumentDefinitions): string {
  return JSON.stringify(doc);
}

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(() => {
    capturedDocs.length = 0;
    service = new PdfService();
  });

  it('deve gerar um Buffer com header de PDF', async () => {
    const buffer = await service.generatePassengerList(buildData());

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('variante boarding deve ter Telefone e não RG (capitão de ônibus)', async () => {
    await service.generatePassengerList(buildData({ variant: 'boarding' }));

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('Telefone');
    expect(serialized).not.toContain('"RG"');
    expect(serialized).not.toContain('12.345.678-9');
  });

  it('variante carrier deve ter RG e não Telefone (empresa de ônibus)', async () => {
    await service.generatePassengerList(buildData({ variant: 'carrier' }));

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('"RG"');
    expect(serialized).toContain('12.345.678-9');
    expect(serialized).not.toContain('Telefone');
    expect(serialized).not.toContain('11 99999-0000');
  });

  it("deve incluir a marca d'água com o nome do usuário e a data", async () => {
    await service.generatePassengerList(buildData({ generatedByName: 'Maria Assistente' }));

    const doc = capturedDocs[0]!;
    const watermark = doc.watermark as { text: string };
    expect(watermark.text).toContain('Maria Assistente');
    expect(watermark.text).toContain('16/06/2026');
  });

  it("deve registrar o horário da marca d'água no fuso de São Paulo (BRT)", async () => {
    // 20:00 UTC → 17:00 em America/Sao_Paulo (UTC-3)
    await service.generatePassengerList(buildData({ generatedAt: new Date('2026-06-16T20:00:00Z') }));

    const watermark = capturedDocs[0]!.watermark as { text: string };
    expect(watermark.text).toContain('16/06/2026 às 17:00');
  });

  it('deve renderizar o título de cada congregação com nome, código e circuito', async () => {
    await service.generatePassengerList(
      buildData({
        congregations: [
          { congregationName: 'Cong A', congregationCode: '111', circuitName: 'SP019', passengers: [] },
          { congregationName: 'Cong B', congregationCode: '222', circuitName: 'SP019', passengers: [] },
        ],
      }),
    );

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('Cong A (111) - SP019');
    expect(serialized).toContain('Cong B (222) - SP019');
  });

  it('deve aplicar máscara de celular (11 dígitos) no telefone', async () => {
    await service.generatePassengerList(buildData({ variant: 'boarding' }));

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('11 99999-0000');
    expect(serialized).not.toContain('11999990000');
  });

  it('deve aplicar máscara de telefone fixo (10 dígitos)', async () => {
    await service.generatePassengerList(
      buildData({
        congregations: [
          {
            congregationName: 'Cong A',
            congregationCode: '111',
            circuitName: 'SP019',
            passengers: [{ index: 1, name: 'Ana Maria', rg: null, phone: '1125557709', observations: null }],
          },
        ],
      }),
    );

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('11 2555-7709');
    expect(serialized).not.toContain('1125557709');
  });

  it('deve normalizar telefones já formatados removendo símbolos', async () => {
    await service.generatePassengerList(
      buildData({
        congregations: [
          {
            congregationName: 'Cong A',
            congregationCode: '111',
            circuitName: 'SP019',
            passengers: [{ index: 1, name: 'Ana Maria', rg: null, phone: '(11) 97753-0630', observations: null }],
          },
        ],
      }),
    );

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('11 97753-0630');
  });

  it('deve exibir "—" quando o telefone é nulo', async () => {
    await service.generatePassengerList(
      buildData({
        congregations: [
          {
            congregationName: 'Cong A',
            congregationCode: '111',
            circuitName: 'SP019',
            passengers: [{ index: 1, name: 'Ana Maria', rg: null, phone: null, observations: null }],
          },
        ],
      }),
    );

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('—');
  });

  it('deve exibir mensagem de vazio quando não há congregações', async () => {
    await service.generatePassengerList(buildData({ congregations: [] }));

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('Nenhum inscrito encontrado');
  });

  describe('agrupamento por dia (multi-dia)', () => {
    const congForDay = (passengerName: string): CongregationPdfBlock[] => [
      {
        congregationName: 'Cong A',
        congregationCode: '111',
        circuitName: 'SP019',
        passengers: [{ index: 1, name: passengerName, rg: null, phone: '11999990000', observations: null }],
      },
    ];

    // Data de calendário a meia-noite UTC (como EventDay.date, coluna @db.Date). O
    // cabeçalho deve formatar em UTC e NÃO deslocar para o dia anterior (off-by-one
    // ao usar o fuso America/Sao_Paulo), independentemente do TZ da máquina (CI/UTC).
    const twoDays: DayPdfBlock[] = [
      {
        dayNumber: 1,
        label: 'Dia 1 - Sexta',
        date: new Date('2026-06-16T00:00:00Z'),
        congregations: congForDay('João Repetido'),
      },
      {
        dayNumber: 2,
        label: 'Dia 2 - Sábado',
        date: new Date('2026-06-17T00:00:00Z'),
        congregations: congForDay('João Repetido'),
      },
    ];

    it('deve renderizar um cabeçalho por dia quando multiDay=true', async () => {
      await service.generatePassengerList(buildData({ multiDay: true, days: twoDays }));

      const serialized = serialize(capturedDocs[0]!);
      // Cabeçalho mostra só o dia da semana + data, sem o prefixo "Dia N - ".
      expect(serialized).toContain('Sexta — 16/06/2026');
      expect(serialized).toContain('Sábado — 17/06/2026');
      expect(serialized).not.toContain('Dia 1 - Sexta —');
    });

    it('deve quebrar página entre os dias (pageBreak no 2º dia em diante)', async () => {
      await service.generatePassengerList(buildData({ multiDay: true, days: twoDays }));

      const serialized = serialize(capturedDocs[0]!);
      expect(serialized).toContain('pageBreak');
    });

    it('não deve renderizar cabeçalho de dia em evento de dia único (multiDay=false)', async () => {
      await service.generatePassengerList(buildData({ multiDay: false }));

      const serialized = serialize(capturedDocs[0]!);
      expect(serialized).not.toContain('pageBreak');
    });
  });

  // ── generatePaymentReceipt (template S-24-T via pdf-lib) ────────
  describe('generatePaymentReceipt', () => {
    function buildReceiptData(overrides: Partial<PaymentReceiptPdfData> = {}): PaymentReceiptPdfData {
      return {
        date: overrides.date ?? new Date('2026-06-19T12:00:00Z'),
        eventTypeLabel: overrides.eventTypeLabel ?? 'Assembleia',
        eventTitle: overrides.eventTitle ?? 'Ouça o que o espírito diz',
        congregationName: overrides.congregationName ?? 'Congregação Cidade Popular',
        totalReceived: overrides.totalReceived ?? '1500.00',
        filledByName: overrides.filledByName ?? 'João da Silva',
        coordinatorName: overrides.coordinatorName !== undefined ? overrides.coordinatorName : 'Carlos Pereira',
      };
    }

    it('deve gerar um Buffer com header de PDF a partir do template', async () => {
      const buffer = await service.generatePaymentReceipt(buildReceiptData());

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar o recibo mesmo sem nome de coordenador (Conferido por vazio)', async () => {
      const buffer = await service.generatePaymentReceipt(buildReceiptData({ coordinatorName: null }));

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar o recibo truncando título de evento muito longo', async () => {
      const buffer = await service.generatePaymentReceipt(
        buildReceiptData({ eventTitle: 'Título extremamente longo '.repeat(10) }),
      );

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  // ── Relatórios financeiros oficiais (templates S-26/S-44 via pdf-lib) ────────
  describe('relatórios financeiros (S-26 / S-44)', () => {
    function buildReportData(overrides: Partial<FinancialReportPdfData> = {}): FinancialReportPdfData {
      return {
        eventTitle: overrides.eventTitle ?? 'Congresso Regional 2026',
        city: overrides.city ?? 'São Paulo',
        state: overrides.state ?? 'SP',
        eventDates: overrides.eventDates ?? '13/06/2026 a 15/06/2026',
        monthYearLabel: overrides.monthYearLabel ?? '06/2026',
        revenueByCongregation: overrides.revenueByCongregation ?? [
          { congregationName: 'Congregação Central', received: '920.00' },
          { congregationName: 'Congregação Norte', received: '640.00' },
        ],
        expenses: overrides.expenses ?? [
          { date: '16/06', description: 'Pagamento dos ônibus', amount: '1500.00' },
          { date: '14/06', description: 'Material de limpeza', amount: '80.00' },
        ],
        totalReceived: overrides.totalReceived ?? '1560.00',
        totalExpenses: overrides.totalExpenses ?? '1580.00',
        balance: overrides.balance ?? '-20.00',
      };
    }

    it('deve gerar o S-26 (Folha de Contas) como Buffer de PDF', async () => {
      const buffer = await service.generateS26Report(buildReportData());

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar o S-44 (Relatório Mensal) como Buffer de PDF', async () => {
      const buffer = await service.generateS44Report(buildReportData());

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar mesmo sem receitas e sem despesas (estado vazio)', async () => {
      const data = buildReportData({
        revenueByCongregation: [],
        expenses: [],
        totalReceived: '0.00',
        totalExpenses: '0.00',
        balance: '0.00',
      });

      expect((await service.generateS26Report(data)).subarray(0, 5).toString()).toBe('%PDF-');
      expect((await service.generateS44Report(data)).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve agregar o excedente quando há mais despesas que linhas no S-44 (capacidade 13)', async () => {
      const expenses = Array.from({ length: 20 }, (_, i) => ({
        date: '10/06',
        description: `Despesa ${i + 1}`,
        amount: '10.00',
      }));
      const data = buildReportData({ expenses, totalExpenses: '200.00' });

      const buffer = await service.generateS44Report(data);

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('exportações financeiras (resumo / extrato)', () => {
    const summaryData = (overrides: Partial<FinancialSummaryExportData> = {}): FinancialSummaryExportData => ({
      eventTitle: 'Congresso Regional 2026',
      generatedAt: new Date('2026-06-29T15:00:00Z'),
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
      generatedAt: new Date('2026-06-29T15:00:00Z'),
      generatedByName: 'João Coordenador',
      congregationName: 'Congregação Central',
      rows: [
        {
          paidAt: new Date('2026-06-20T10:00:00Z'),
          passengerName: 'Maria',
          congregationName: 'Central',
          amount: '50.00',
          observations: null,
        },
      ],
      totalReceived: '50.00',
      ...overrides,
    });

    it('deve gerar o resumo financeiro como Buffer de PDF', async () => {
      const buffer = await service.generateFinancialSummaryPdf(summaryData());

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar o extrato de pagamentos como Buffer de PDF', async () => {
      const buffer = await service.generatePaymentsExtractPdf(extractData());

      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('deve gerar resumo e extrato mesmo vazios (estado vazio)', async () => {
      expect(
        (await service.generateFinancialSummaryPdf(summaryData({ congregations: [] }))).subarray(0, 5).toString(),
      ).toBe('%PDF-');
      expect(
        (await service.generatePaymentsExtractPdf(extractData({ rows: [], totalReceived: '0.00' })))
          .subarray(0, 5)
          .toString(),
      ).toBe('%PDF-');
    });
  });
});
