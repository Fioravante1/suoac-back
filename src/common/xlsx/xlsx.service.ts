import { Injectable } from '@nestjs/common';
import writeXlsxFile, { type CellObject, type Row, type SheetData } from 'write-excel-file/node';
import type { FinancialSummaryExportData, PaymentsExtractExportData } from '../export/financial-export.interface';

const HEADER_BG = '#1e3a5f';
const MONEY_FORMAT = '#,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';

/**
 * Encapsula a `write-excel-file` (mantém a lib isolada do resto do código, como o
 * `PdfService` faz com `pdfmake`). Gera planilhas a partir dos shapes de exportação
 * financeira. Dinheiro chega como string `"NN.NN"` e é convertido para número
 * **apenas aqui** (fronteira de saída do XLSX), com formato `#,##0.00` para permitir
 * soma na planilha — os cálculos de domínio permanecem em centavos/string.
 */
@Injectable()
export class XlsxService {
  async generateFinancialSummary(data: FinancialSummaryExportData): Promise<Buffer> {
    const rows: SheetData = [
      [this.titleCell(data.eventTitle)],
      [this.mutedCell(`Gerado por ${data.generatedByName} em ${this.formatDateTimeBR(data.generatedAt)}`)],
      [],
      [this.labelCell('Inscritos'), this.numberCell(data.totals.totalPassengers)],
      [this.labelCell('Total esperado'), this.moneyCell(data.totals.totalExpected)],
      [this.labelCell('Total recebido'), this.moneyCell(data.totals.totalReceived)],
      [this.labelCell('Total pendente'), this.moneyCell(data.totals.totalPending)],
      [],
      [
        this.headerCell('Congregação'),
        this.headerCell('Inscritos'),
        this.headerCell('Esperado'),
        this.headerCell('Recebido'),
        this.headerCell('Pendente'),
        this.headerCell('Pagos'),
        this.headerCell('Parciais'),
        this.headerCell('Pendentes'),
        this.headerCell('Isentos'),
      ],
      ...data.congregations.map(
        (c): Row => [
          this.textCell(c.congregationName),
          this.numberCell(c.totalPassengers),
          this.moneyCell(c.totalExpected),
          this.moneyCell(c.totalReceived),
          this.moneyCell(c.totalPending),
          this.numberCell(c.byStatus.paid),
          this.numberCell(c.byStatus.partial),
          this.numberCell(c.byStatus.pending),
          this.numberCell(c.byStatus.exempt),
        ],
      ),
    ];

    const columns = [{ width: 36 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }];

    return writeXlsxFile(rows, { sheet: 'Resumo', columns }).toBuffer();
  }

  async generatePaymentsExtract(data: PaymentsExtractExportData): Promise<Buffer> {
    const head: SheetData = [
      [this.titleCell(data.eventTitle)],
      ...(data.congregationName ? [[this.mutedCell(`Congregação: ${data.congregationName}`)]] : []),
      [this.mutedCell(`Gerado por ${data.generatedByName} em ${this.formatDateTimeBR(data.generatedAt)}`)],
      [],
      [
        this.headerCell('Data'),
        this.headerCell('Passageiro'),
        this.headerCell('Congregação'),
        this.headerCell('Valor'),
        this.headerCell('Observações'),
      ],
    ];

    const body: SheetData = data.rows.map(
      (r): Row => [
        this.dateCell(r.paidAt),
        this.textCell(r.passengerName),
        this.textCell(r.congregationName),
        this.moneyCell(r.amount),
        this.textCell(r.observations ?? ''),
      ],
    );

    const totalRow: Row = [this.labelCell('Total recebido'), null, null, this.moneyCell(data.totalReceived), null];

    const columns = [{ width: 12 }, { width: 32 }, { width: 28 }, { width: 14 }, { width: 40 }];

    return writeXlsxFile([...head, ...body, [], totalRow], { sheet: 'Pagamentos', columns }).toBuffer();
  }

  private titleCell(text: string): CellObject {
    return { type: String, value: text, fontWeight: 'bold', textColor: HEADER_BG };
  }

  private mutedCell(text: string): CellObject {
    return { type: String, value: text, textColor: '#666666' };
  }

  private labelCell(text: string): CellObject {
    return { type: String, value: text, fontWeight: 'bold' };
  }

  private headerCell(text: string): CellObject {
    return { type: String, value: text, fontWeight: 'bold', backgroundColor: HEADER_BG, textColor: '#ffffff' };
  }

  private textCell(value: string): CellObject {
    return { type: String, value };
  }

  private numberCell(value: number): CellObject {
    return { type: Number, value, align: 'right' };
  }

  private moneyCell(value: string): CellObject {
    return { type: Number, value: Number(value), format: MONEY_FORMAT, align: 'right' };
  }

  private dateCell(value: Date): CellObject {
    return { type: Date, value, format: DATE_FORMAT };
  }

  private formatDateTimeBR(date: Date): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
  }
}
