import { EventEmitter } from 'node:events';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfService } from './pdf.service';
import type { PassengerListPdfData } from './interfaces/passenger-list-pdf.interface';
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

function buildData(overrides: Partial<PassengerListPdfData> = {}): PassengerListPdfData {
  return {
    eventTitle: overrides.eventTitle ?? 'Congresso Regional 2026',
    eventVenue: overrides.eventVenue ?? 'Ginásio Municipal',
    eventCity: overrides.eventCity ?? 'São Paulo',
    eventState: overrides.eventState ?? 'SP',
    circuitName: overrides.circuitName ?? 'SP019',
    generatedAt: overrides.generatedAt ?? new Date('2026-06-16T14:32:00'),
    generatedByName: overrides.generatedByName ?? 'João Coordenador',
    includeSensitive: overrides.includeSensitive ?? false,
    congregations: overrides.congregations ?? [
      {
        congregationName: 'Congregação Cidade Popular',
        congregationCode: '105478',
        circuitName: 'SP019',
        passengers: [
          { index: 1, name: 'Ana Maria', rg: '12.345.678-9', phone: '11999990000', observations: 'Cadeira de rodas' },
          { index: 2, name: 'Bruno Costa', rg: '98.765.432-1', phone: null, observations: null },
        ],
      },
    ],
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

  it('não deve incluir a coluna RG quando includeSensitive=false', async () => {
    await service.generatePassengerList(buildData({ includeSensitive: false }));

    const doc = capturedDocs[0]!;
    const serialized = serialize(doc);
    expect(serialized).toContain('Telefone');
    expect(serialized).not.toContain('"RG"');
    expect(serialized).not.toContain('12.345.678-9');
  });

  it('deve incluir a coluna RG e os valores quando includeSensitive=true', async () => {
    await service.generatePassengerList(buildData({ includeSensitive: true }));

    const serialized = serialize(capturedDocs[0]!);
    expect(serialized).toContain('"RG"');
    expect(serialized).toContain('12.345.678-9');
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
    await service.generatePassengerList(buildData({ includeSensitive: true }));

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
});
