import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateAmendmentContractDto {
    @IsString()
    articleKey: string;

    @IsString()
    title: string;

    @IsString()
    content: string;

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
