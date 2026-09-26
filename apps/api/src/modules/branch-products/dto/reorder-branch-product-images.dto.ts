import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';
import type { ReorderBranchProductImagesInput } from '@hungrybox/shared';

export class ReorderBranchProductImagesDto implements ReorderBranchProductImagesInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  orderedImageIds!: string[];
}
