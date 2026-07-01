/**
 * Resultado da exportação da listagem de inscritos, independente do formato (PDF ou XLSX).
 * `congregationCode` está presente quando o export foi filtrado por uma congregação —
 * usado pelo controller para compor o nome do arquivo.
 */
export interface PassengerListExportResult {
  buffer: Buffer;
  congregationCode?: string;
}
