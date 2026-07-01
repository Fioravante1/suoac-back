import { Injectable } from '@nestjs/common';
import writeXlsxFile, { type CellObject, type Row, type SheetData } from 'write-excel-file/node';
import type { FinancialSummaryExportData, PaymentsExtractExportData } from '../export/financial-export.interface';
import type { PassengerListPdfData } from '../pdf/interfaces/passenger-list-pdf.interface';
import { formatPhone } from '../phone/phone.util';

const HEADER_BG = '#1e3a5f';
const BRAND_COLOR = '#1e3a5f';
const MONEY_FORMAT = '#,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';

/** Larguras das colunas da planilha de inscritos: #, Nome, RG/Telefone, Observações. */
const PASSENGER_LIST_COLUMNS = [{ width: 6 }, { width: 36 }, { width: 20 }, { width: 40 }];
const EMPTY_PASSENGER_LIST_MESSAGE = 'Nenhum inscrito encontrado para os filtros selecionados.';

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

  /**
   * Gera a planilha da listagem de inscritos a partir do mesmo `PassengerListPdfData`
   * consumido pelo `PdfService`, espelhando o layout do PDF: cabeçalho do evento,
   * agrupamento por dia (multi-dia) → congregação, e colunas conforme a variante
   * (`carrier` → RG · `boarding` → Telefone).
   */
  async generatePassengerList(data: PassengerListPdfData): Promise<Buffer> {
    const rows: SheetData = [
      [this.titleCell(data.eventTitle)],
      [this.mutedCell(`${data.eventVenue} — ${data.eventCity}/${data.eventState}`)],
      [this.mutedCell(`Circuito ${data.circuitName}`)],
      [this.mutedCell(`Gerado por ${data.generatedByName} em ${this.formatDateTimeBR(data.generatedAt)}`)],
      [],
    ];

    const hasPassengers = data.days.some((day) => day.congregations.length > 0);
    if (!hasPassengers) {
      rows.push([this.mutedCell(EMPTY_PASSENGER_LIST_MESSAGE)]);
      return writeXlsxFile(rows, { sheet: 'Inscritos', columns: PASSENGER_LIST_COLUMNS }).toBuffer();
    }

    const isCarrier = data.variant === 'carrier';
    const secondColumnLabel = isCarrier ? 'RG' : 'Telefone';

    for (const day of data.days) {
      if (day.congregations.length === 0) {
        continue;
      }
      if (data.multiDay) {
        // Mostra apenas o dia da semana + data (sem o prefixo "Dia N - " do label), como no PDF.
        const weekday = day.label.replace(/^Dia\s+\d+\s*-\s*/, '');
        rows.push([this.dayTitleCell(`${weekday} — ${this.formatCalendarDateBR(day.date)}`)]);
      }
      for (const block of day.congregations) {
        rows.push([
          this.sectionTitleCell(`${block.congregationName} (${block.congregationCode}) - ${block.circuitName}`),
        ]);
        rows.push([
          this.headerCell('#'),
          this.headerCell('Nome'),
          this.headerCell(secondColumnLabel),
          this.headerCell('Observações'),
        ]);
        for (const passenger of block.passengers) {
          const secondColumnValue = isCarrier ? passenger.rg : formatPhone(passenger.phone);
          rows.push([
            this.numberCell(passenger.index),
            this.textCell(passenger.name),
            this.textCell(secondColumnValue ?? '—'),
            this.textCell(passenger.observations ?? '—'),
          ]);
        }
        rows.push([this.mutedCell(`Total: ${block.passengers.length} passageiro(s)`)]);
        rows.push([]);
      }
    }

    return writeXlsxFile(rows, { sheet: 'Inscritos', columns: PASSENGER_LIST_COLUMNS }).toBuffer();
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

  private dayTitleCell(text: string): CellObject {
    return { type: String, value: text, fontWeight: 'bold', backgroundColor: BRAND_COLOR, textColor: '#ffffff' };
  }

  private sectionTitleCell(text: string): CellObject {
    return { type: String, value: text, fontWeight: 'bold', textColor: BRAND_COLOR };
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

  /**
   * Formata uma data de calendário (`EventDay.date`, coluna `@db.Date` → meia-noite UTC)
   * **em UTC**, sem conversão de fuso — usar o fuso local converteria a meia-noite UTC
   * para o dia anterior (off-by-one). Espelha o `formatCalendarDateBR` do `PdfService`.
   */
  private formatCalendarDateBR(date: Date): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')}`;
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
