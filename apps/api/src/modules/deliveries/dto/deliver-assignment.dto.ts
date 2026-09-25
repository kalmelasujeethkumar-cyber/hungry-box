import { IsBoolean, IsOptional } from 'class-validator';

export class DeliverAssignmentDto {
  /** True when COD cash was collected from the customer. Ignored for pre-paid orders. */
  @IsOptional()
  @IsBoolean()
  cashCollected?: boolean;
}