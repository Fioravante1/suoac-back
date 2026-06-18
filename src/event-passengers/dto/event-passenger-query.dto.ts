import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaymentStatus } from '../../generated/prisma/enums';

/**
 * Normaliza um parâmetro de query que pode chegar como valor único
 * (`?eventDayIds=a`), múltiplo (`?eventDayIds=a&eventDayIds=b`) ou separado por
 * vírgula (`?eventDayIds=a,b`). Aplica `trim` e remove duplicados, mas **não**
 * descarta itens vazios: uma string vazia é preservada para que a validação
 * `@IsUUID` falhe (evita filtro silencioso) em vez de sumir sem erro.
 */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const items: unknown[] = Array.isArray(value) ? value : [value];
  // Apenas itens string são considerados (query params chegam como string);
  // cada um pode conter CSV. Itens vazios são preservados de propósito para que
  // a validação @IsUUID falhe (evita filtro silencioso).
  const normalized = items.flatMap((item) =>
    typeof item === 'string' ? item.split(',').map((part) => part.trim()) : [],
  );
  return [...new Set(normalized)];
}

export class EventPassengerQueryDto extends PaginationQueryDto {
  /** Filtro por status de pagamento (disponível para todos os roles). */
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  /** Filtra por congregação — roles de circuito; roles de congregação só a própria. */
  @IsOptional()
  @IsUUID('4')
  congregationId?: string;

  /** Busca parcial, case-insensitive, pelo nome do passageiro (todos os roles). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  /** Filtra inscritos que participam de ao menos um dos dias informados (união) — todos os roles. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray()
  @IsUUID('4', { each: true })
  eventDayIds?: string[];
}
