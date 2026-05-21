import { IsIn } from 'class-validator';
import { EventStatus } from '../../generated/prisma/enums';

const TRANSITIONABLE_STATUSES = [EventStatus.OPEN, EventStatus.CLOSED, EventStatus.FINISHED] as const;

export class TransitionEventStatusDto {
  @IsIn(TRANSITIONABLE_STATUSES)
  status!: (typeof EventStatus)[keyof typeof EventStatus];
}
