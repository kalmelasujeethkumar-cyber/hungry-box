import { IsIn, IsString, MinLength } from 'class-validator';

export class DevPaymentSimulateDto {
  @IsString()
  @MinLength(1)
  providerPaymentId!: string;

  @IsIn(['success', 'failure'])
  outcome!: 'success' | 'failure';
}
