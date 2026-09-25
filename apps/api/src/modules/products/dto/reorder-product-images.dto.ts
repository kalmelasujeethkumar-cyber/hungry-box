import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';
import type { ReorderProductImagesInput } from '@hungrybox/shared';

export class ReorderProductImagesDto implements ReorderProductImagesInput {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  orderedImageIds!: string[];
}
