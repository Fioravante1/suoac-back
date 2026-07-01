import type { SheetData } from 'write-excel-file/node';
import type { PassengerListPdfData } from '../pdf/interfaces/passenger-list-pdf.interface';

/**
 * Captura o `SheetData` entregue ao `writeXlsxFile` para validar cabeçalhos/linhas — o
 * mapeamento interno do `XlsxService`, que a assinatura ZIP do binário não prova. O mock
 * devolve um buffer fake; a geração do XLSX **real** (assinatura `PK`) é coberta em
 * `xlsx.service.spec.ts`.
 */
const writeXlsxFileSpy = jest.fn<unknown, [SheetData, unknown]>();
jest.mock('write-excel-file/node', () => ({
  __esModule: true,
  default: (rows: SheetData, options: unknown): { toBuffer(): Buffer } => {
    writeXlsxFileSpy(rows, options);
    return { toBuffer: (): Buffer => Buffer.from([0x50, 0x4b, 0x03, 0x04]) };
  },
}));

import { XlsxService } from './xlsx.service';

const GENERATED_AT = new Date('2026-06-29T15:00:00Z');
const EVENT_DATE = new Date('2026-07-10T00:00:00Z');

const passengerData = (overrides: Partial<PassengerListPdfData> = {}): PassengerListPdfData => ({
  eventTitle: 'Congresso Regional 2026',
  eventVenue: 'Ginásio Central',
  eventCity: 'São Paulo',
  eventState: 'SP',
  circuitName: 'SP-01',
  generatedAt: GENERATED_AT,
  generatedByName: 'João Coordenador',
  variant: 'boarding',
  multiDay: false,
  days: [
    {
      dayNumber: 1,
      label: 'Dia 1 - Sexta-feira',
      date: EVENT_DATE,
      congregations: [
        {
          congregationName: 'Congregação Central',
          congregationCode: '105',
          circuitName: 'SP-01',
          passengers: [
            {
              index: 1,
              name: 'Maria Silva',
              rg: '12.345.678-9',
              phone: '11977530630',
              observations: 'janela',
            },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

/** Valores de célula (string) do SheetData capturado, achatando linhas e ignorando vazios. */
const capturedValues = (): string[] => {
  const rows = writeXlsxFileSpy.mock.calls[0]?.[0];
  if (!rows) {
    return [];
  }
  return rows
    .flat()
    .map((cell) => (cell && typeof cell === 'object' && 'value' in cell ? String(cell.value) : ''))
    .filter((value) => value.length > 0);
};

describe('XlsxService.generatePassengerList', () => {
  let service: XlsxService;

  beforeEach(() => {
    writeXlsxFileSpy.mockClear();
    service = new XlsxService();
  });

  it('deve retornar um Buffer', async () => {
    const buffer = await service.generatePassengerList(passengerData());

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('deve usar coluna RG (sem Telefone) na variante carrier', async () => {
    await service.generatePassengerList(passengerData({ variant: 'carrier' }));

    const values = capturedValues();
    expect(values).toContain('RG');
    expect(values).not.toContain('Telefone');
    expect(values).toContain('12.345.678-9');
  });

  it('deve usar coluna Telefone (sem RG) e formatar o telefone na variante boarding', async () => {
    await service.generatePassengerList(passengerData({ variant: 'boarding' }));

    const values = capturedValues();
    expect(values).toContain('Telefone');
    expect(values).not.toContain('RG');
    expect(values).toContain('11 97753-0630');
    expect(values).not.toContain('12.345.678-9');
  });

  it('deve renderizar cabeçalho de dia em evento multi-dia', async () => {
    await service.generatePassengerList(passengerData({ multiDay: true }));

    expect(capturedValues()).toContain('Sexta-feira — 10/07/2026');
  });

  it('não deve renderizar cabeçalho de dia em evento de dia único', async () => {
    await service.generatePassengerList(passengerData({ multiDay: false }));

    expect(capturedValues()).not.toContain('Sexta-feira — 10/07/2026');
  });

  it('deve exibir estado vazio quando não há inscritos (multi-dia sem dias)', async () => {
    await service.generatePassengerList(passengerData({ multiDay: true, days: [] }));

    expect(capturedValues()).toContain('Nenhum inscrito encontrado para os filtros selecionados.');
  });
});
