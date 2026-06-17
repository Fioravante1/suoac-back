import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PdfPrinter from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatPhone } from '../phone/phone.util';
import type { CongregationPdfBlock, PassengerListPdfData } from './interfaces/passenger-list-pdf.interface';

const BRAND_COLOR = '#1e3a5f';
const MUTED_COLOR = '#666666';

@Injectable()
export class PdfService {
  private readonly printer: InstanceType<typeof PdfPrinter>;
  private readonly logoDataUri: string;

  constructor() {
    const baseDir = PdfService.resolveAssetBaseDir();
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
