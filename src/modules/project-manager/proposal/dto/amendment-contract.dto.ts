import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateAmendmentContractDto {
    @IsString()
    articleKey!: string;

    @IsString()
    title!: string;

    @IsString()
    content!: string;

    @IsOptional()
    @IsNumber()
    order?: number;
}

export class UpdateAmendmentContractDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsNumber()
    order?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class AmendmentContractQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}