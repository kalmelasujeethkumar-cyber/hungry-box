import { IsIn } from 'class-validator';

const ADVANCE_STATUS_CHOICES = [
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export class BranchOrderStatusDto {
  @IsIn(ADVANCE_STATUS_CHOICES)
  status!: (typeof ADVANCE_STATUS_CHOICES)[number];
}
