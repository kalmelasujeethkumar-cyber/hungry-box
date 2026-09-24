import { IsEnum } from 'class-validator';

export class SetupAvailabilityDto {
  @IsEnum(['ONLINE', 'OFFLINE'] as const)
  availability!: 'ONLINE' | 'OFFLINE';
}