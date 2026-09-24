import { IsIn, IsOptional } from 'class-validator';

const ORDER_STATUS_CHOICES = [
  'PLACED',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export class CustomerOrderQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUS_CHOICES)
  status?: (typeof ORDER_STATUS_CHOICES)[number];
}
