import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { PassengerListVariant } from '../../common/pdf/interfaces/passenger-list-pdf.interface';

export class ExportPassengersQueryDto {
  @IsOptional()
  @IsUUID()
  congregationId?: string;

  /**
   * Variante (público-alvo) da listagem:
   * - `carrier`  — vai para a empresa de ônibus (Nome, RG, Observação). Contém RG →
   *   restrita a roles de circuito (validado no service).
   * - `boarding` — conferência de embarque do capitão de ônibus (Nome, Telefone,
   *   Observação). Sem RG → disponível a todos os roles.
   *
   * Default (omitido) → `boarding`, a variante sem dado sensível.
   */
  @IsOptional()
  @IsIn(['carrier', 'boarding'])
  variant?: PassengerListVariant;
}
