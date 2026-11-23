/**
 * Data de calendário, sem hora: `2026-10-12`. É o formato das datas do evento (o
 * dia, o fim do congresso e os prazos), que o formulário envia de um
 * `<input type="date">`. A API decide o instante a partir dela, e texto com hora
 * ou fora do formato viraria `Invalid Date` e um erro 500 do Prisma.
 *
 * O DTO confere também que a data existe, com `@IsISO8601({ strict: true })`:
 * `2026-02-30` tem a forma, mas não é data.
 */
export const CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** `$property` é trocado pelo nome do campo pelo `class-validator`. */
export const CALENDAR_DATE_MESSAGE = '$property deve ser uma data no formato AAAA-MM-DD';
