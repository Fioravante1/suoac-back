import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFForm,
  type PDFPage,
} from 'pdf-lib';
import PdfPrinter from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { addMoney, formatMoneyPtBR } from '../money/money.util';
import { formatPhone } from '../phone/phone.util';
import type {
  FinancialReportExpenseLine,
  FinancialReportPdfData,
  FinancialReportRevenueLine,
} from './interfaces/financial-report-pdf.interface';
import type { PaymentReceiptPdfData } from './interfaces/payment-receipt-pdf.interface';
import type { CongregationPdfBlock, PassengerListPdfData } from './interfaces/passenger-list-pdf.interface';

/** Posição de um campo de formulário (widget annotation) numa página. */
interface FieldPosition {
  name: string;
  page: number;
  x: number;
  y: number;
}

const FORM_FONT_SIZE = 8;
const FORM_DATE_FONT_SIZE = 6;

const BRAND_COLOR = '#1e3a5f';
const MUTED_COLOR = '#666666';

@Injectable()
export class PdfService {
  private readonly printer: InstanceType<typeof PdfPrinter>;
  private readonly logoDataUri: string;
  private readonly baseDir: string;

  constructor() {
    const baseDir = PdfService.resolveAssetBaseDir();
    this.baseDir = baseDir;
    const fontsDir = join(baseDir, 'fonts');
    this.printer = new PdfPrinter({
      Roboto: {
        normal: join(fontsDir, 'Roboto-Regular.ttf'),
        bold: join(fontsDir, 'Roboto-Medium.ttf'),
        italics: join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: join(fontsDir, 'Roboto-MediumItalic.ttf'),
      },
    });

    const logoBuffer = readFileSync(join(baseDir, 'assets', 'logo.png'));
    this.logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  }

  /**
   * Localiza o diretório de assets (fonts/ e assets/) de forma tolerante à
   * estrutura de build. Cobre dev/teste (__dirname aponta para src/common/pdf),
   * build em dist/src e build em dist. Falha cedo se nenhum candidato existir.
   */
  private static resolveAssetBaseDir(): string {
    const candidates = [
      __dirname,
      join(process.cwd(), 'src', 'common', 'pdf'),
      join(process.cwd(), 'dist', 'src', 'common', 'pdf'),
      join(process.cwd(), 'dist', 'common', 'pdf'),
    ];

    const found = candidates.find((dir) => existsSync(join(dir, 'fonts', 'Roboto-Regular.ttf')));

    if (!found) {
      throw new Error('PdfService: assets de fontes não encontrados em nenhum caminho conhecido');
    }

    return found;
  }

  async generatePassengerList(data: PassengerListPdfData): Promise<Buffer> {
    const docDefinition = this.buildDocDefinition(data);
    return this.renderToBuffer(docDefinition);
  }

  /**
   * Preenche o formulário oficial S-24-T ("RECIBO") com os dados de pagamento de
   * uma congregação. O template é um PDF "chapado" (sem campos AcroForm), então o
   * preenchimento é feito desenhando texto por coordenadas (origem inferior-esquerda).
   */
  async generatePaymentReceipt(data: PaymentReceiptPdfData): Promise<Buffer> {
    const templateBytes = readFileSync(join(this.baseDir, 'assets', 'recibo.pdf'));
    const pdf = await PDFDocument.load(templateBytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const page = pdf.getPages()[0];
    if (!page) {
      throw new Error('PdfService: template do recibo (recibo.pdf) sem páginas');
    }

    const valorBR = `R$ ${formatMoneyPtBR(data.totalReceived)}`;
    const description = `Pagamento Ref. Arranjo de ônibus ${data.eventTypeLabel} ${data.eventTitle}`;

    // Data (à direita do rótulo "Data:")
    PdfService.drawText(page, font, this.formatDateBR(data.date), { x: 312, y: 191, size: 9 });

    // "X" na caixinha de "Pagamento" (linha 1, coluna 2)
    PdfService.drawText(page, fontBold, 'X', { x: 167, y: 175, size: 11 });

    // Linha livre 1: descrição da referência do pagamento (logo acima da congregação)
    PdfService.drawTextFit(page, font, description, { x: 35, y: 103, size: 8, maxWidth: 262 });
    // Linha livre 2 ("linha de cima do total"): congregação (esq.) + valor (coluna de valor)
    PdfService.drawTextFit(page, font, data.congregationName, { x: 35, y: 90, size: 9, maxWidth: 200 });
    PdfService.drawRightAligned(page, font, valorBR, { right: 356, y: 90, size: 9 });
    // TOTAL (coluna de valor)
    PdfService.drawRightAligned(page, fontBold, valorBR, { right: 356, y: 75, size: 10 });

    // Assinaturas: nome sobre a linha de "(Preenchido por)" / "(Conferido por)"
    PdfService.drawCentered(page, font, data.filledByName, { center: 108, y: 51, size: 8 });
    if (data.coordinatorName) {
      PdfService.drawCentered(page, font, data.coordinatorName, { center: 290, y: 51, size: 8 });
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  /**
   * Preenche o formulário oficial S-26 (Folha de Contas) com os lançamentos do evento.
   * Consolidado por congregação na coluna OUTRA: ENTRADA = recebido por congregação;
   * SAÍDA = uma linha por despesa. Campos preenchidos por nome (Cenário A) após registrar
   * os widgets órfãos no AcroForm.
   */
  async generateS26Report(data: FinancialReportPdfData): Promise<Buffer> {
    const pdf = await PDFDocument.load(readFileSync(join(this.baseDir, 'assets', 's26.pdf')));
    const page1 = PdfService.buildFieldIndex(pdf).filter((f) => f.page === 0);

    const sortTop = (fields: FieldPosition[]): string[] => fields.sort((a, b) => b.y - a.y).map((f) => f.name);
    const dataCells = sortTop(page1.filter((f) => f.name.endsWith('_Text_C') && f.x <= 25 && f.y < 745));
    const descCells = sortTop(page1.filter((f) => /_Text$/.test(f.name) && f.x >= 40 && f.x <= 60 && f.y < 745));
    const entradaCells = sortTop(page1.filter((f) => f.name.endsWith('S26Value') && f.x >= 460 && f.x < 515));
    const saidaCells = sortTop(page1.filter((f) => f.name.endsWith('S26Value') && f.x >= 515));
    // OUTRA: ENTRADA total ≈ x468, SAÍDA total ≈ x522 (DONATIVOS/CONTA BANCÁRIA ficam à esquerda)
    const entradaTotal = page1.find((f) => f.name.endsWith('S26TotalValue') && f.x >= 460 && f.x < 515)?.name;
    const saidaTotal = page1.find((f) => f.name.endsWith('S26TotalValue') && f.x >= 515)?.name;

    const header = page1.filter((f) => f.name.endsWith('_Text_C') && f.y > 745);
    const headerEvento = header.find((f) => f.x < 100)?.name;
    const headerCidade = header.find((f) => f.x >= 200 && f.x < 300)?.name;
    const headerEstado = header.find((f) => f.x >= 300 && f.x < 420)?.name;
    const headerDatas = header.find((f) => f.x >= 420)?.name;

    return this.fillAndRender(pdf, (form, present) => {
      const set = PdfService.fieldSetter(form, present);

      set(headerEvento, data.eventTitle);
      set(headerCidade, data.city);
      set(headerEstado, data.state);
      set(headerDatas, data.eventDates);

      const capacity = descCells.length;
      const revenue = PdfService.fitRevenue(data.revenueByCongregation, Math.max(1, capacity - data.expenses.length));
      const expenses = PdfService.fitExpenses(data.expenses, capacity - revenue.length);

      let row = 0;
      for (const rev of revenue) {
        set(descCells[row], rev.congregationName);
        set(entradaCells[row], formatMoneyPtBR(rev.received));
        row += 1;
      }
      for (const exp of expenses) {
        // Coluna DATA é estreita (~23pt) → fonte menor para caber "dd/mm".
        set(dataCells[row], exp.date, FORM_DATE_FONT_SIZE);
        set(descCells[row], exp.description);
        set(saidaCells[row], formatMoneyPtBR(exp.amount));
        row += 1;
      }

      set(entradaTotal, formatMoneyPtBR(data.totalReceived));
      set(saidaTotal, formatMoneyPtBR(data.totalExpenses));
    });
  }

  /**
   * Preenche o formulário oficial S-44 (Relatório Mensal de Contas) com os dados do evento:
   * ENTRADAS = recebido por congregação; DESPESAS = uma linha por despesa; saldos calculados.
   * Saldo inicial e fundos reservados são "0,00" (não se aplicam ao escopo do evento).
   */
  async generateS44Report(data: FinancialReportPdfData): Promise<Buffer> {
    const pdf = await PDFDocument.load(readFileSync(join(this.baseDir, 'assets', 's44.pdf')));

    const entradaDesc = Array.from({ length: 8 }, (_, i) => `900_${4 + i * 2}_Text`);
    const entradaVal = Array.from({ length: 8 }, (_, i) => `901_${5 + i * 2}_S44Rec`);
    const despesaDesc = Array.from({ length: 13 }, (_, i) => `900_${21 + i * 2}_Text`);
    const despesaVal = Array.from({ length: 13 }, (_, i) => `901_${22 + i * 2}_S44Ex`);

    return this.fillAndRender(pdf, (form, present) => {
      const set = PdfService.fieldSetter(form, present);

      set('900_1_Text', data.eventTitle);
      set('900_2_Text', data.monthYearLabel);
      set('901_3_S44BOM', formatMoneyPtBR('0.00')); // (a) saldo inicial

      const revenue = PdfService.fitRevenue(data.revenueByCongregation, entradaVal.length);
      revenue.forEach((rev, i) => {
        set(entradaDesc[i], rev.congregationName);
        set(entradaVal[i], formatMoneyPtBR(rev.received));
      });
      set('901_20_S44TotalRec', formatMoneyPtBR(data.totalReceived)); // (b)

      const expenses = PdfService.fitExpenses(data.expenses, despesaVal.length);
      expenses.forEach((exp, i) => {
        set(despesaDesc[i], exp.description);
        set(despesaVal[i], formatMoneyPtBR(exp.amount));
      });
      set('901_47_S44TotalEx', formatMoneyPtBR(data.totalExpenses)); // (c)

      set('901_48_S44SurDef', formatMoneyPtBR(data.balance)); // (d) = (b) − (c)
      set('901_49_S44EOM', formatMoneyPtBR(data.balance)); // (e) = (a) + (d)
      set('901_54_S44TotalSpec', formatMoneyPtBR('0.00')); // (f) fundos reservados
      set('901_55_S44TotalFunds', formatMoneyPtBR(data.balance)); // (g) = (e) − (f)
    });
  }

  /** Registra widgets, preenche via callback, achata (não editável) e devolve o Buffer. */
  private async fillAndRender(
    pdf: PDFDocument,
    fill: (form: PDFForm, present: Set<string>) => void,
  ): Promise<Buffer> {
    PdfService.registerOrphanWidgets(pdf);
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const form = pdf.getForm();
    const present = new Set(form.getFields().map((f) => f.getName()));

    fill(form, present);

    form.updateFieldAppearances(helvetica);
    form.flatten();
    return Buffer.from(await pdf.save());
  }

  /** Closure que preenche um campo de texto por nome (com tamanho de fonte opcional), se existir. */
  private static fieldSetter(
    form: PDFForm,
    present: Set<string>,
  ): (name: string | undefined, value: string, fontSize?: number) => void {
    return (name, value, fontSize = FORM_FONT_SIZE) => {
      if (!name || !present.has(name)) {
        return;
      }
      const field = form.getTextField(name);
      field.setText(value);
      field.setFontSize(fontSize);
    };
  }

  /**
   * Registra no `/Fields` do AcroForm os widgets que existem nas páginas mas estão
   * "órfãos" (não referenciados) — caso dos modelos S-26/S-44. Sem isso o `pdf-lib`
   * não enxerga os campos. Idempotente.
   */
  private static registerOrphanWidgets(pdf: PDFDocument): void {
    const acroForm = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    if (!acroForm) {
      return;
    }

    let fields = acroForm.lookup(PDFName.of('Fields'), PDFArray);
    if (!fields) {
      fields = pdf.context.obj([]);
      acroForm.set(PDFName.of('Fields'), fields);
    }

    const existing = new Set<string>();
    for (let i = 0; i < fields.size(); i += 1) {
      existing.add(fields.get(i).toString());
    }

    for (const page of pdf.getPages()) {
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      if (!annots) {
        continue;
      }
      for (let i = 0; i < annots.size(); i += 1) {
        const ref = annots.get(i);
        const annot = annots.lookup(i, PDFDict);
        if (!annot) {
          continue;
        }
        const subtype = annot.lookup(PDFName.of('Subtype'), PDFName);
        if (!subtype || subtype.toString() !== '/Widget') {
          continue;
        }
        if (ref instanceof PDFRef && !existing.has(ref.toString())) {
          fields.push(ref);
          existing.add(ref.toString());
        }
      }
    }
  }

  /** Lê nome + posição de cada widget de texto (decodifica nomes em UTF-16BE, ex.: S-44). */
  private static buildFieldIndex(pdf: PDFDocument): FieldPosition[] {
    const out: FieldPosition[] = [];

    pdf.getPages().forEach((page, pageIndex) => {
      const annots = page.node.lookup(PDFName.of('Annots'), PDFArray);
      if (!annots) {
        return;
      }
      for (let i = 0; i < annots.size(); i += 1) {
        const annot = annots.lookup(i, PDFDict);
        if (!annot) {
          continue;
        }
        const subtype = annot.lookup(PDFName.of('Subtype'), PDFName);
        if (!subtype || subtype.toString() !== '/Widget') {
          continue;
        }
        const titleObj = annot.get(PDFName.of('T'));
        const rect = annot.lookup(PDFName.of('Rect'), PDFArray);
        if (!(titleObj instanceof PDFString || titleObj instanceof PDFHexString) || !rect) {
          continue;
        }
        out.push({
          name: titleObj.decodeText(),
          page: pageIndex,
          x: Math.round(rect.lookup(0, PDFNumber).asNumber()),
          y: Math.round(rect.lookup(1, PDFNumber).asNumber()),
        });
      }
    });

    return out;
  }

  /** Encaixa N linhas em `capacity`; o excedente vira uma linha agregada. */
  private static fitRevenue(items: FinancialReportRevenueLine[], capacity: number): FinancialReportRevenueLine[] {
    if (capacity <= 0 || items.length <= capacity) {
      return items.slice(0, Math.max(0, capacity));
    }
    const head = items.slice(0, capacity - 1);
    const rest = items.slice(capacity - 1);
    return [
      ...head,
      { congregationName: `Demais congregações (${rest.length})`, received: addMoney(...rest.map((r) => r.received)) },
    ];
  }

  private static fitExpenses(items: FinancialReportExpenseLine[], capacity: number): FinancialReportExpenseLine[] {
    if (capacity <= 0 || items.length <= capacity) {
      return items.slice(0, Math.max(0, capacity));
    }
    const head = items.slice(0, capacity - 1);
    const rest = items.slice(capacity - 1);
    return [
      ...head,
      { date: '', description: `Outras despesas (${rest.length})`, amount: addMoney(...rest.map((e) => e.amount)) },
    ];
  }

  private static drawText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    opts: { x: number; y: number; size: number },
  ): void {
    page.drawText(text, { x: opts.x, y: opts.y, size: opts.size, font, color: rgb(0, 0, 0) });
  }

  /** Desenha texto truncando com reticências se exceder `maxWidth`. */
  private static drawTextFit(
    page: PDFPage,
    font: PDFFont,
    text: string,
    opts: { x: number; y: number; size: number; maxWidth: number },
  ): void {
    let value = text;
    if (font.widthOfTextAtSize(value, opts.size) > opts.maxWidth) {
      while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, opts.size) > opts.maxWidth) {
        value = value.slice(0, -1);
      }
      value = `${value.trimEnd()}…`;
    }
    page.drawText(value, { x: opts.x, y: opts.y, size: opts.size, font, color: rgb(0, 0, 0) });
  }

  private static drawRightAligned(
    page: PDFPage,
    font: PDFFont,
    text: string,
    opts: { right: number; y: number; size: number },
  ): void {
    const width = font.widthOfTextAtSize(text, opts.size);
    page.drawText(text, { x: opts.right - width, y: opts.y, size: opts.size, font, color: rgb(0, 0, 0) });
  }

  private static drawCentered(
    page: PDFPage,
    font: PDFFont,
    text: string,
    opts: { center: number; y: number; size: number },
  ): void {
    const width = font.widthOfTextAtSize(text, opts.size);
    page.drawText(text, { x: opts.center - width / 2, y: opts.y, size: opts.size, font, color: rgb(0, 0, 0) });
  }

  /** Data (somente dia/mês/ano) no fuso America/Sao_Paulo. */
  private formatDateBR(date: Date): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')}`;
  }

  private renderToBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', (err: Error) => reject(err));
      pdfDoc.end();
    });
  }

  private buildDocDefinition(data: PassengerListPdfData): TDocumentDefinitions {
    return {
      pageMargins: [40, 90, 40, 50],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: '#222222' },
      watermark: {
        text: `Gerado por ${data.generatedByName} em ${this.formatDateTime(data.generatedAt)}`,
        opacity: 0.07,
        bold: false,
        italics: false,
      },
      header: this.buildPageHeader(data),
      footer: (currentPage: number, pageCount: number): Content => ({
        columns: [
          {
            text: `Gerado por ${data.generatedByName} em ${this.formatDateTime(data.generatedAt)}`,
            fontSize: 7,
            color: MUTED_COLOR,
          },
          { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 7, color: MUTED_COLOR },
        ],
        margin: [40, 15, 40, 0],
      }),
      content: this.buildContent(data),
      styles: {
        sectionTitle: { fontSize: 12, bold: true, color: BRAND_COLOR, margin: [0, 14, 0, 6] },
        sectionTotal: { fontSize: 9, italics: true, color: MUTED_COLOR, margin: [0, 4, 0, 0] },
        tableHeader: { bold: true, color: 'white', fontSize: 9 },
        emptyState: { fontSize: 12, italics: true, color: MUTED_COLOR, margin: [0, 40, 0, 0], alignment: 'center' },
      },
    };
  }

  private buildPageHeader(data: PassengerListPdfData): Content {
    return {
      columns: [
        { image: this.logoDataUri, width: 90, margin: [40, 15, 0, 0] },
        {
          stack: [
            { text: data.eventTitle, fontSize: 14, bold: true, color: BRAND_COLOR },
            { text: `${data.eventVenue} — ${data.eventCity}/${data.eventState}`, fontSize: 9, color: MUTED_COLOR },
            { text: `Circuito ${data.circuitName}`, fontSize: 9, color: MUTED_COLOR },
          ],
          alignment: 'right',
          margin: [0, 28, 40, 0],
        },
      ],
    };
  }

  private buildContent(data: PassengerListPdfData): Content {
    if (data.congregations.length === 0) {
      return { text: 'Nenhum inscrito encontrado para os filtros selecionados.', style: 'emptyState' };
    }

    return data.congregations.flatMap((block) => this.buildCongregationBlock(block, data.includeSensitive));
  }

  private buildCongregationBlock(block: CongregationPdfBlock, includeSensitive: boolean): Content[] {
    const title = `${block.congregationName} (${block.congregationCode}) - ${block.circuitName}`;

    const headerCells: TableCell[] = includeSensitive
      ? [
          { text: '#', style: 'tableHeader' },
          { text: 'Nome', style: 'tableHeader' },
          { text: 'RG', style: 'tableHeader' },
          { text: 'Telefone', style: 'tableHeader' },
          { text: 'Observações', style: 'tableHeader' },
        ]
      : [
          { text: '#', style: 'tableHeader' },
          { text: 'Nome', style: 'tableHeader' },
          { text: 'Telefone', style: 'tableHeader' },
          { text: 'Observações', style: 'tableHeader' },
        ];

    const bodyRows: TableCell[][] = block.passengers.map((p) =>
      includeSensitive
        ? [String(p.index), p.name, p.rg ?? '—', formatPhone(p.phone) ?? '—', p.observations ?? '—']
        : [String(p.index), p.name, formatPhone(p.phone) ?? '—', p.observations ?? '—'],
    );

    // Telefone com largura fixa para acomodar "11 99999-0000" sem quebra de linha.
    const widths = includeSensitive ? ['auto', '*', 'auto', 80, '*'] : ['auto', '*', 80, '*'];

    return [
      { text: title, style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths,
          body: [headerCells, ...bodyRows],
        },
        layout: {
          fillColor: (rowIndex: number): string | null => {
            if (rowIndex === 0) {
              return BRAND_COLOR;
            }
            return rowIndex % 2 === 0 ? '#f4f6f8' : null;
          },
          hLineWidth: (): number => 0.5,
          vLineWidth: (): number => 0,
          hLineColor: (): string => '#dddddd',
          paddingTop: (): number => 4,
          paddingBottom: (): number => 4,
        },
      },
      { text: `Total: ${block.passengers.length} passageiro(s)`, style: 'sectionTotal' },
    ];
  }

  /**
   * Formata a data no fuso `America/Sao_Paulo`, independente do fuso do
   * servidor (em produção normalmente UTC), garantindo que o horário
   * registrado no PDF corresponda ao horário local de quem imprimiu.
   */
  private formatDateTime(date: Date): string {
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
