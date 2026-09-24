import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,119}$/, {
    message: 'Slug must be lowercase alphanumeric (hyphens allowed)',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;
}
