import { IsIn } from 'class-validator';
import { CongregationListStatus } from '../../generated/prisma/enums';

const ALLOWED_STATUSES = [CongregationListStatus.PENDING, CongregationListStatus.FINALIZED] as const;

export class UpdateCongregationEventStatusDto {
  @IsIn(ALLOWED_STATUSES)
  status!: (typeof CongregationListStatus)[keyof typeof CongregationListStatus];
}
