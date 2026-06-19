import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import PdfPrinter from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatMoneyPtBR } from '../money/money.util';
import { formatPhone } from '../phone/phone.util';
import type { PaymentReceiptPdfData } from './interfaces/payment-receipt-pdf.interface';
import type { CongregationPdfBlock, PassengerListPdfData } from './interfaces/passenger-list-pdf.interface';

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
