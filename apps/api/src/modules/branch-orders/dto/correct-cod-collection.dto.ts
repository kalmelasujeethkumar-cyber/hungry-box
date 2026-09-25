import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CorrectCodCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}